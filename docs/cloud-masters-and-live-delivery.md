# Private cloud masters and live notification execution

The cloud adapter is implemented, but **installing or deploying code does not connect a Blob store, approve a messaging provider, grant capture licences or enable sends**. Missing configuration fails closed. Keep production and preview databases/stores/credentials separate.

## 1. Private master storage on Vercel

Connect a **PRIVATE Vercel Blob store** to the `eastsound` production project. A public Blob store is not suitable for masters, even with random URLs. Do not guess which existing store belongs to this application, change another application's store, or upgrade a paid plan without approval.

Configure these **server-side, Production-only** variables in Vercel's secure settings:

| Variable                     | Requirement                                                                                                                                        |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EAST_SOUND_STORAGE_BACKEND` | `postgres`; apply the existing migrations 001 and 002 first.                                                                                       |
| `DATABASE_URL`               | The existing private PostgreSQL connection. Certificate and hostname verification are required.                                                    |
| `EAST_SOUND_POSTGRES_TLS`    | `verify-full` when an integration-managed URL supplies `sslmode=require`; this strengthens the mode in memory.                                     |
| `EAST_SOUND_TENANT_ID`       | The existing workspace UUID. Do not rotate it to recover a missing account or reset data.                                                          |
| `EAST_SOUND_APP_ORIGIN`      | The exact canonical HTTPS application origin, no path/trailing slash. Also used for the signed Blob callback.                                      |
| `EAST_SOUND_MASTER_STORAGE`  | `vercel-blob`, explicitly selecting the direct-upload adapter.                                                                                     |
| `BLOB_READ_WRITE_TOKEN`      | The private store's server credential, saved as Sensitive. Never `NEXT_PUBLIC_*`.                                                                  |
| `EAST_SOUND_SECRET_KEY`      | The existing independent 32-byte encryption key for owner webhook credentials. Back it up separately from the database; do not rotate it casually. |

The existing production identity schema is sufficient: upload intents use owner-bound `east_sound.account_documents` records. No new schema migration or user/data reset is required for this adapter.

### Upload protocol

1. The signed-in **non-mock artist** computes the existing browser `OfflineAudioContext`/worker signature and obtains all independent collaborator approvals. The approved contract binds metadata, source SHA-256, feature digest and three 100% ownership pools.
2. `POST /api/master-uploads` accepts **at most 64 KiB of JSON metadata**, not audio. It checks the session, CSRF, role, file extension/type/size, feature digest and current source-bound approvals. Per-account limits bound ticket creation and verification attempts. Invalid immutable bytes abandon the intent rather than permitting unlimited re-downloads.
3. Before issuing any real upload ticket, the server writes a non-sensitive four-byte object with `access: private`, verifies that its private URL cannot be fetched anonymously, and deletes the probe. Public stores, custom Blob API overrides, bad credentials and failed cleanup fail closed. The result is cached for five minutes per token/workspace/process; a credential/store change is rechecked.
4. The browser uses `@vercel/blob/client` **private multipart upload directly to storage**, with an exact server-generated path. `/api/master-uploads/token` requires the artist session, same-origin/CSRF checks, an owned pending intent and still-valid approvals. Its short-lived capability permits only the expected MIME/size/path, no overwrite and no random path substitution. A ticket lasts at most 15 minutes; an intent lasts one hour.
5. Blob completion callbacks have no browser session. The SDK validates the callback HMAC with the server store credential **before** any receipt is persisted. The signed owner/intent/path and private URL are checked against the existing owner document. Callbacks are idempotent receipts, not proof of a checksum, approval or delivered master.
6. `POST /api/master-uploads/:id` acquires an owner-bound verification lease and streams the stored object through a bounded SHA-256/container check. Actual size, MIME, first audio bytes, full source checksum and immutable ETag must match. **Exactly 80 MiB (83,886,080 bytes) is supported; larger objects are rejected.** The full master is never buffered into a serverless request or a whole in-memory download.
7. After verification, one PostgreSQL transaction locks/rechecks the intent, active artist and agreement, then inserts the master, marks the agreement/intent complete and appends the delivery audit. A database/audit error rolls everything back. A changed/expired verification lease cannot commit. Unique release-contract/ISRC constraints prevent duplicate delivery under concurrent requests. A retry returns the already committed owned recording rather than copying another object.

The API never accepts a client-provided storage URL, owner/tenant authority, approved split replacement or provider ETag. Catalogue rows contain only an opaque server-side upload reference; private paths remain in owner documents. All storage references are removed from browser, public, station and CMO projections.

The feature digest is checked against its submitted feature payload, and source bytes are independently hashed on the server. This is **not server-side PCM feature recomputation**, licensed broadcast recognition, legal identity verification, rights certification or official ISRC registration.

### Playback, withdrawal and cleanup

- Owner-only `GET /api/tracks/:id` streams private bytes through the authenticated application, with verified ETags and single byte-range support. It never redirects to a Blob URL or forwards store credentials/provider headers. Responses are `no-store` and vary on Cookie. Other artists, guests, broadcasters and CMO auditors cannot download a master.
- Vercel's old multipart master endpoint is explicitly rejected even when cloud delivery is enabled. No `/tmp` master-success path is introduced. The original persistent-Node filesystem flow remains available in local mode.
- Withdrawing a PostgreSQL recording soft-deletes the catalogue row and immediately removes normal playback access. Its private master remains retained for audit/retention policy. Withdrawal is **not a permanent object purge**.
- `DELETE /api/master-uploads/:id` can cancel only an owner's uncommitted, non-active upload. The maintenance worker also processes up to 25 stale intents in bounded concurrent batches after 24 hours. It fences their state first and checks **all catalogue references, including soft-deleted rows**, before deleting an orphan. Completed/retained masters are never auto-purged. Cleanup is eligible after 24 hours and happens on a later successful run, not at an exact deletion deadline.
- Provider-managed incomplete multipart parts may need the provider's own expiry/retention mechanism. A cancelled client transfer is not a claim that all remote parts were immediately purged.
- Back up the database, private store and encryption key consistently. Changing store credentials to point at a different store is not an asset migration. Plan object copies, reference validation and retention separately.

## 2. Automatic notification execution

Preferences already enqueue scoped, opted-in jobs when an authorised real capture commits. This release adds:

- A bounded `next/server after()` dispatch attempt registered **only after capture persistence succeeds**. Failed ingestion, simulator buttons and master-upload callbacks do not trigger an airplay send.
- A protected scheduled maintenance endpoint to retry eligible leased outbox jobs and clean expired master-upload orphans.
- Account outbox readiness showing which providers, worker/live switches and scheduled retry authentication are missing. `Configured` is not proof of provider approval, acceptance or delivery.

Jobs remain durable when a request/worker stops. Existing PostgreSQL leases, generation/entitlement/consent rechecks, idempotency and bounded retry/backoff rules remain authoritative. A dispatch-registration/provider failure does not turn a committed capture into a failed write. Notifications are at-least-once; a provider accepting a request is not a delivered/read receipt.

### Explicit activation

Do not simply flip the live switch before reviewing providers, destinations, consent and pending backlog. Configure at least one approved channel securely:

| Channel           | Server configuration / external requirements                                                                                                                                                                                                                                                          |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WhatsApp Business | `WHATSAPP_ACCESS_TOKEN`, numeric `WHATSAPP_PHONE_NUMBER_ID`, a currently supported `WHATSAPP_GRAPH_VERSION`, approved `WHATSAPP_TEMPLATE_NAME`, optional template language; a genuinely opted-in recipient. A personal WhatsApp number and the phone simulator are not provider credentials.          |
| Email             | `RESEND_API_KEY` and a verified `EAST_SOUND_EMAIL_FROM` sender; recipient consent. Mailbox ownership verification, recovery and MFA remain separate launch requirements.                                                                                                                              |
| Webhook           | `EAST_SOUND_WEBHOOK_ALLOWLIST` with exact approved public HTTPS URLs, and each owner's independent 32+ character HMAC secret stored through the encrypted, write-only preference flow. Retain DNS/IP pinning, replay bounds and redirect rejection. Never treat an arbitrary browser URL as approved. |

Then deliberately set `EAST_SOUND_LIVE_NOTIFICATIONS=true` and `EAST_SOUND_WORKER_ENABLED=1`. Both are required for automatic post-capture and scheduled dispatch. Without a configured provider, no outbox jobs are claimed. Unconfigured channels remain pending even when a different channel is available. Never put provider credentials in chat, browser storage, client environment variables, examples or Git.

A licensed upstream capture/matching service and its independently protected `EAST_SOUND_INGEST_TOKEN` are still required for actual airplay. Uploading a track does not create a broadcast. Use your own approved provider test tools/recipients or a dedicated staging setup for delivery validation; do not inject invented captures into production to manufacture alerts.

### Scheduler and plan limits

Set an independently generated **32+ character `CRON_SECRET`** as Sensitive, Production-only. Vercel sends it as the Bearer credential to `GET /api/maintenance`. Missing/weak/wrong credentials are rejected before cleanup, queue claiming or provider I/O.

The checked-in Vercel Cron schedule is **`0 0 * * *` (03:00 EAT)**. This daily retry/cleanup safety net is compatible with the Hobby plan. It is **not an instant retry guarantee**. Do not silently add minute-level Hobby cron or upgrade a billing plan.

For prompt retries after transient failures or idle periods, use a supervised persistent worker (`npm run worker:notifications`) or an authorised external scheduler calling the protected endpoint at a reviewed frequency. Increasing request frequency does not bypass row leases, consent, live switches or channel readiness. The existing explicitly privileged POST dispatch contract remains available for separately managed integrations.

Daily/weekly PDF email recaps remain the separately reviewed digest scheduler contract described in [notification operations](notifications-and-capture.md); this maintenance cron drains instant-event outbox jobs, not arbitrary browser-exported digest configurations.

## 3. Validation and rollout

Run `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:postgres`, then the Node and static builds **serially**. New tests cover private-store/public-access rejection, actual streamed source hashing at the 80 MiB boundary, range/ETag checks, SDK callback HMAC, CSRF/role/owner isolation, transactional commit/audit rollback, concurrent release consumption, stale leases, orphan cleanup/retained masters, direct browser transport and deferred/scheduled dispatch gates.

The PostgreSQL suites always use disposable loopback databases and test-only accounts. Blob/provider I/O is mocked in automated tests; a green suite is not a claim that a real private store, Meta sender, email domain, webhook recipient or external scheduler is connected or working. No real external message is sent by the test suite.

Configure edge abuse controls, storage/egress quotas and billing alerts before public upload rollout; per-account request limits are not a tenant-wide storage budget.

Review/merge the change, connect the production-only private store/provider secrets, deploy, and verify real provider readiness and a controlled, consented workflow before calling live delivery activated. Keep the live switch off if any provider/consent prerequisite remains unverified. Static export remains a public-only showcase with no private APIs or sends.
