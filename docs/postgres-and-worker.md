# PostgreSQL captures and notification worker

PostgreSQL is an **explicit opt-in backend**, not an automatic migration or an already-connected service. The default file-backed app and static showcase remain available. No production database has been provisioned, existing private files imported, station captured or provider message sent by adding this integration.

## 1. Runtime and connection configuration

Use Node 22 and PostgreSQL 14+ (a currently supported release is recommended). Install dependencies with `npm ci`. The application/CLI use `pg`, `dotenv` and runtime `tsx`; no Axios or mock email sender is required. Embedded PostgreSQL is **development/test-only**, never the production datastore.

Set these **server-side** variables in your secret manager or ignored `.env` file. The CLI reads `.env`; Next also supports its usual environment-file conventions. Do not put secrets in `NEXT_PUBLIC_*`, a browser export, Git or command-line URLs.

| Variable                              | Meaning                                                                                                                                                                |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EAST_SOUND_STORAGE_BACKEND=postgres` | Required explicit selection. Unset/`file` preserves the existing JSON backend.                                                                                         |
| `DATABASE_URL`                        | PostgreSQL URL. Non-loopback hosts **must** specify `sslmode=verify-full`; configure a trusted CA as required by your provider. No disabling certificate verification. |
| `EAST_SOUND_TENANT_ID`                | Non-nil UUID for this deployment's workspace.                                                                                                                          |
| `EAST_SOUND_NOTIFICATION_USER_ID`     | Non-nil external principal UUID for separately managed administrative rule-registration only; not an end-user role or account ID.                                      |
| `EAST_SOUND_INGEST_TOKEN`             | Independent random Bearer secret of at least 32 characters for capture ingestion.                                                                                      |
| `EAST_SOUND_NOTIFICATION_TOKEN`       | Independent random Bearer secret of at least 32 characters for private rule registration/status/HTTP dispatch.                                                         |
| `EAST_SOUND_LIVE_NOTIFICATIONS`       | Leave unset/`false` until consent, real providers and destinations are configured. Must be exactly `true` to send.                                                     |
| `EAST_SOUND_DATA_DIR`                 | Still required as durable storage for `uploads/` even when catalogue/airplay/attempts use PostgreSQL.                                                                  |

Generate workspace/principal UUIDs with `node -e "console.log(require('node:crypto').randomUUID())"`. Tokens must be separately generated cryptographically random secrets, not UUIDs or the placeholders in this documentation. A UUID column does not authenticate anybody.

Pool connections are lazy (maximum 10 per process), with 5-second connection, 30-second statement and 10-second lock timeouts. Size the database for **all web and worker processes**. No remote connection is opened just by importing a module. Choosing PostgreSQL never silently falls back to private JSON if the database fails.

## 2. Apply migrations and explicitly seed references

Back up existing data and use a dedicated development database first:

```bash
npm run db:migrate
npm run db:seed
```

- `db/migrations/001_capture_outbox.sql` creates the dedicated `east_sound` schema; **002** adds accounts, hashed sessions, owner documents, security audit and the unique delivery-contract constraint. Apply both before serving the authenticated app. The old `prisma/schema.prisma` is an **unwired historical draft**, not the active schema; do not `prisma db push` it over this integration.
- Migrations are explicit, advisory-locked, transactional and SHA-256 recorded in `public.east_sound_schema_migrations`. Requests never run migrations. A modified/unknown applied migration fails closed; add a new migration instead. The initial migration deliberately refuses to overwrite an unrelated existing `east_sound` schema.
- Native `gen_random_uuid()` avoids unnecessary `uuid-ossp`/`btree_gist` extension permissions. The requested enums and UUID relationships are retained; external string keys preserve the app's existing `ref_...` / `trk_...` / station identifiers.
- Seeding creates the configured workspace, the known FM/TV **disconnected directory**, and the 12 sourced public-release references. It inserts no captures, masters, ownership, notifications or invented ISRCs. Repeating the seed does not overwrite existing records. Unknown ISRCs and stream URLs remain `NULL`.
- Existing `.data` catalogue/masters/captures/reservations are **not automatically imported or deleted**. Plan and verify a separate reviewed import before switching a workspace containing genuine deliveries/history. Do not create synthetic replacement activity to populate the database. Keep file mode until that import is complete.
- Track deletion is soft so retained capture/outbox audits stay referentially intact; associated master bytes are retained pending an explicit secure retention/purge policy, not claimed to be permanently erased. ISRC reservations are transactionally serialized across database processes, but remain local tags—not official registry assignments. Unknown public-reference identifiers are never allocated just to fill a database column.

Use a migration owner for DDL; provision restricted runtime roles according to your deployment. The app needs its record/sequence/function permissions, and either pre-created partitions or permission to create them. Functions are **not security-definer shortcuts** and no superuser extensions are installed.

## 3. Register opted-in rules privately

### Authenticated account watches (default application flow)

The notification UI saves to session/CSRF-protected `/api/preferences`. Saving atomically updates the account document and its owner-bound SQL rules; new captures then queue jobs without a browser export or operator token. Endpoint secrets are encrypted in account documents and decrypted only by the worker. `/api/notifications/outbox` returns that signed-in artist's redacted job status. Provision real accounts and apply migrations **001 and 002** as described in [fullstack operations](fullstack-operations.md).

### Separately privileged integration watches

The older **trusted administrative integration** remains available for explicitly managed watches. It is not called by the account settings UI:

```http
POST /api/notifications/rules
Authorization: Bearer <EAST_SOUND_NOTIFICATION_TOKEN>
Content-Type: application/json

{"config":{...the-exported-NotificationPreferences-object...}}
```

The raw exported configuration object is also accepted. The server always uses its configured tenant/principal UUIDs; body-supplied `tenant_id`/`user_id` values cannot change that scope. The endpoint validates catalogue/station scope, channel consent and configuration shape. It expands subscriptions to at most 1,000 channel/trigger/destination rules and creates explicit per-recording watch entitlements. `track_id IS NULL` means **this principal's entitled workspace tracks**, never every artist in the database. “All” snapshots currently known catalogue tracks; resync after new recordings are added.

Registration is transactional and sends nothing. Semantically unchanged exported settings preserve the activation/generation. A changed configuration (including an edit/resume activation marker) replaces that principal's managed watch rules, uses a new **server-clock activation window**, and invalidates old queued generations. Browser timestamps cannot backdate activation. Reapply this administrative configuration after its own edits. Authenticated account settings have separate principals and are synchronized immediately by `/api/preferences`; do not register overlapping administrative copies of those watches.

The UI-managed API supports first-spin, milestone and prime-time rules. The database also supports operator-managed `custom_threshold` (an exact positive integer FM count, not arbitrary executable code) and optional every-N `milestone_step`. Keep custom SQL-managed rules under a separate principal/configuration lifecycle: syncing a principal replaces its managed rules. Manage and audit consent and watch entitlements explicitly; do not blindly turn on every database rule.

Private status:

```http
GET /api/notifications/rules
Authorization: Bearer <EAST_SOUND_NOTIFICATION_TOKEN>
```

Returns aggregate outbox status counts only, not contacts, payloads or credentials. `sent` means **provider-accepted**, not delivery/read confirmation. Invalid/unconfigured auth fails closed; validation and storage failures do not reset rules.

**Security boundary:** the current Bearer API is an administrative integration for a configured workspace/principal. It is not end-user login, row-level security, artist ownership verification, a consent-verification service or a full multi-tenant SaaS authorization system. The app now has independent email/password sessions, CSRF and authoritative server-side RBAC/owner/station isolation; the static role selector has been removed. These account sessions do not grant integration-token authority, and a browser cannot self-select a tenant or privileged role. Tenant columns/composite foreign keys and watch checks prevent accidental cross-workspace joins; they do not protect against a database owner or a stolen operator token.

## 4. Ingest real captures; queue in the same transaction

Continue using the protected `POST /api/playout` contract in [notifications-and-capture.md](notifications-and-capture.md). It accepts 1–100 validated records, not SQL/browser simulator events. The PostgreSQL backend atomically commits:

1. A global **tenant + provider-event-ID** deduplication key and monthly-partitioned log.
2. Matched FM lifetime and EAT-day counters.
3. Any entitled, active, consented, correctly scoped notification outbox entries.

The trigger does **no HTTP**. Concurrent first spins serialize through an atomic per-track UPSERT, rather than `COUNT(*)` scans. An identical provider-ID retry is a no-op; reusing an ID for changed capture identity returns HTTP **409**, including changes that would move the event into another partition. A failed batch rolls back logs, dedup keys, counters and jobs together. Provider IDs must be stable and unique within a workspace across providers; namespace them if necessary. Submit final matching results, not provisional reclassifications under the same immutable ID.

Only matched FM logs drive music alerts. TV/unmatched logs remain audited without FM milestones. First-spin refers to the first FM record admitted to connected history, not a worldwide first or a promise that late-arriving history is chronological. Historical pre-activation records still increment counters without retrospective sends. Global counters are evaluated **before** station/region rule filters. Exact milestones are not invented if a qualifying event was outside the rule's active/scope window. Prime-time uses Capital/CBS/Galaxy and 06–10 / 16–20 **Africa/Kampala**, irrespective of server timezone.

Unknown matched identifiers remain unknown. The database validates release/future dates, matched known ISRC consistency, duration/confidence, tenant references and supplied ten-second evidence fields; a URL/hash still does not prove lawful capture, match identity or actual remote media duration. The online-stream enum is retained for schema compatibility, but the current capture UI/API supports known FM/TV directory entries only. No station stream/fingerprint is supplied or automatically connected.

## 5. Start the polling worker, or invoke it privately

Configure **real** providers as documented in [notifications-and-capture.md](notifications-and-capture.md): Meta approved WhatsApp template/current explicit graph version, Resend key/verified email sender, or exact-allowlisted public HTTPS webhook + a strong shared HMAC secret. No `YOUR_PHONE_NUMBER_ID`, guessed graph version, `test-sig` fallback, free-form Meta bypass or console-only “email sent” behavior is used.

After explicit live enable:

```bash
# Continuously poll under a process supervisor/container:
npm run worker:notifications

# One batch, then exit (also refuses to send unless properly enabled/configured):
npm run worker:notifications -- --once
```

The worker polls every three seconds when idle and drains eligible batches up to 20, with at most five concurrent sends per process. Graceful SIGINT/SIGTERM finishes in-flight work then closes its pool. A hard crash leaves jobs recoverable by their leases. Provider-unconfigured channels are left pending without consuming attempts; configure before enabling rules and monitor for backlog. The worker logs counts/bounded codes only, not destinations, driver errors or raw provider bodies.

As an alternative scheduler entry point:

```http
POST /api/notifications/dispatch
Authorization: Bearer <EAST_SOUND_NOTIFICATION_TOKEN>
Content-Type: application/json

{"action":"instant"}
```

In PostgreSQL mode this **only drains committed outbox jobs**. It rejects `config`, `since` and `force`; register preferences using the rules endpoint first. It never separately rescans history into the old instant-dispatch path. Multiple HTTP/CLI workers use the same shared queue, so they do not independently generate duplicate jobs.

### Claim, retry and acceptance semantics

- `FOR UPDATE SKIP LOCKED` claims disjoint batches and commits before network I/O. No database client/transaction is held over a provider request.
- Claims have a random lease token and a 120-second database-clock lease, renewed/fenced immediately before I/O. Completion must still own an unexpired lease. Revoked consent/watch scope, edited destinations/generations and deleted tracks are checked again immediately before sending. Revocation cannot recall a request already in flight/accepted.
- Attempts increment on claim, including a crashed attempt. Defaults: **three total attempts**, backoff 60 then 120 seconds for retryable failures; permanent errors or exhausted crashes become `failed` dead letters. Ready-time and expired-lease partial indexes support polling.
- The worker reuses the existing approved-template, Resend and public-DNS-pinned, no-redirect **HMAC-SHA256** webhook transport. It keeps the same network/size limits and stable job idempotency identifiers across retries. Custom-threshold JSON relay events use `airplay.custom_threshold`.
- `sent`/`accepted` records actual adapter/provider acceptance only. Provider credentials/approval are not verified by opening the UI. Missing configuration never counts as sent. No delivered/read receipts are fabricated.
- This is **at-least-once**, not distributed exactly-once. A provider may accept just before a crash/timeout prevents recording the outcome. Meta and other providers do not universally honor idempotency keys. Add verified delivery callbacks/reconciliation; use your relay's durable deduplication where possible.
- No automated dead-letter replay is supplied. Investigate the job and provider outcome before any operator retry; blindly resetting status can duplicate a real send. Retain failed jobs for review and monitor old pending jobs, expired leases and provider errors. Apply provider-specific shared quotas/rate limiting across worker replicas.

## 6. Daily/weekly digests still work

Completed-EAT-day/week PDF/Resend digests retain the existing authenticated HTTP scheduling contract with `{ "action": "daily" | "weekly", "config": ... }`. Their capture/catalogue reads use PostgreSQL, and period/recipient attempt IDs now use the shared **`scheduled_delivery_attempts`** lease ledger rather than a process-local JSON file. They are period-derived jobs, not individual-airplay trigger rows, and the three-second CLI worker does not automatically schedule them. Supply the exported configuration to your private daily/weekly scheduler. The same consent/live/provider checks and bounded retries apply; force never bypasses consent.

The file backend retains its existing instant/digest scheduler behavior. Do not point a legacy `{action:"instant",config:...}` scheduler at PostgreSQL mode: it is explicitly rejected instead of double-dispatching.

## 7. Partitions, retention, privacy and production limitations

- Partitions are real **UTC calendar months**, not the example's quarterly Q4 table. Migration pre-creates the previous month through three months ahead. Valid app ingestion ensures additional needed months transactionally with an advisory DDL lock. Pre-create future/historical partitions under a maintenance role when using a DML-only runtime account:

  ```sql
  SELECT east_sound.ensure_airplay_partition('2027-03-01T00:00:00Z'::timestamptz);
  ```

- The log primary key is `(tenant_id, played_at, id)`, and outbox/dedup foreign keys include the **complete partition key**. A global tenant/provider registry prevents cross-month duplicate IDs. There is no automatic partition dropping or destructive purge. Those foreign keys deliberately prevent accidental loss of referenced evidence/jobs; design and test an archive/retention procedure with DBA/legal review before dropping partitions. Keep dedup keys/counters consistent with retained history.
- **PostgreSQL rules/outbox contain private destinations and rendered-message inputs.** This differs from the file attempt ledger, which contains metadata only. Restrict database/backup access, use encrypted transport/storage/backups, define purpose/retention policies, and never commit a production dump or browser export. Provider tokens stay in runtime configuration. Per-account HMAC secrets are encrypted in owner documents, never plaintext outbox rows; protect and back up the separately managed `EAST_SOUND_SECRET_KEY`. Legacy integration HMAC secrets remain in runtime configuration. Status/log responses exclude contacts.
- PostgreSQL persists catalogue, captures, reservations, instantaneous outbox jobs and digest attempt metadata. Master bytes are still on the configured filesystem. Multiple web replicas/serverless hosting need shared durable upload/object storage and proper authenticated download access; a database alone does not provide that.
- Reporting currently materializes workspace capture history in application memory. Partitioned writes, indexed counters and queue claims do **not** make every dashboard query million-row optimized. Add time-window SQL aggregation/pagination and load tests before high-volume deployment.
- No capture daemon, licensed fingerprint matcher, station licence, verified legal identity/mailbox, official ISRC/CMO registration, tariff certification, external scheduler service or delivery callback endpoint is provisioned here. The app implements password accounts and independent immutable account-bound approvals; those are not legal identity, regulated e-signature or rights certification.
- On Vercel without PostgreSQL, runtime reads serve public references directly and perform no local filesystem writes. Configured PostgreSQL enables durable capture/outbox paths, but Vercel master catalogue mutations remain disabled pending authenticated direct-to-object-storage support; an ephemeral directory is never treated as durable storage. See the README deployment and verification sections.
- Static export forces the file/public-reference path and strips APIs/private data/worker entrypoints. It cannot connect a database or deliver notifications.

## 8. Verification

```bash
npm run typecheck
npm run lint
npm test
npm run test:postgres
npm run build
npm run build:static
```

`test:postgres` always boots a disposable loopback PostgreSQL cluster under ignored `.data/qa/`, creates its own random tenant/port, uses no configured production URL and stops/removes the cluster on completion. It is separate from the default unit test glob; provider transports are mocked, **not live-sent**. It checks real SQL constraints/transactions, migrations/checksums/idempotent honest seeding, concurrent first plays/provider-ID deduplication, cross-partition conflicts, tenant/entitlement boundaries, EAT windows, rollback, independent claims, lease recovery/fencing, retries, consent revocation, routing and shared digest attempts. Root-only initdb environments require a non-root test user; no OS account is silently created. CI runs this suite before the static export.
