# Authenticated fullstack operations

This is the Node application, not the read-only static showcase. No production database, account, capture source, OAuth provider, notification provider or deployment is provisioned by checking out or building the repository.

## Local development

Use Node 22, `npm ci`, and `npm run dev -- --hostname 0.0.0.0`. Copy `.env.example` to the ignored `.env` for explicit configuration; the CLI reads `.env` and Next supports its usual environment files. Public entry points are `/dashboard/charts` and `/dashboard/stats`; `/login` supports email/password sign-up and sign-in. Self-registration always creates **Artist / Label Manager**, never an operator-selected role. Use an isolated `EAST_SOUND_DATA_DIR` for QA. `.data` and `.env*` are private and ignored.

`EAST_SOUND_APP_ORIGIN` must be the exact externally visible origin, e.g. `https://your-domain.example`, without a path or trailing slash. In a proxied preview, use that preview's HTTPS origin, not localhost. Browser requests use relative same-origin URLs. Configure your TLS reverse proxy, host restrictions and request-size/time budgets; forward cookies securely. Do not make a private volume publicly served.

### Authority and data isolation

| Principal                     | Allowed data and actions                                                                                                                                                                                         |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public Guest                  | National charts and minimized public platform statistics. No private API, master, evidence URL, rights, recipient or operator feed. Private pages redirect to sign-in.                                           |
| Artist / Label Manager        | Their own immutable-owner masters, captures, agreements, regional analytics and alert preferences; sourced public release research. No other artist's audio, catalogue, preferences or queue.                    |
| Broadcaster / Station Manager | Only immutable operator-assigned station logs and source settings, redacted matched recording metadata and the assigned-station ad-planning view. No master downloads, artist rights/contacts or CMO ledgers.    |
| CMO Auditor                   | Workspace-wide capture/allocation/audit ledgers, weighting controls, split inspection and append-only rights-review decisions. Cannot co-sign another contributor's allocation or download their private master. |

Every private route checks a server-resolved account/session before serializing data. Request/localStorage `role`, `userId`, tenant and station selections do not grant permission. The deployment's PostgreSQL tenant is server configuration. API writes require the session's CSRF header plus same-origin checks. Private responses are `no-store` and vary on Cookie.

Passwords use random salts and scrypt (`N=32768, r=8, p=3`); never plaintext or browser password storage. An opaque random session is stored only in the `east_sound_session` **HttpOnly / SameSite=Lax / Secure over HTTPS** cookie. Only its SHA-256 is persisted server-side. Remembered sessions last seven days; non-remembered sessions last twelve hours. Guess throttling is persistent. Use a trusted edge rate limiter for Internet-facing abuse protection as well.

`east-sound:session-display:v1` in localStorage is display-only, with no cookie value, password or authorization token. IndexedDB `east-sound-private-cache-v1/snapshots` caches catalogue, capture, signature, preference and station snapshots under the verified user ID. These caches never authorize a request; the server remains the source of truth. Logout/account changes evict private caches. Storage events and an identity-free BroadcastChannel cause other tabs to re-check the cookie; an account/assignment change performs a full navigation to drop stale React state. Blocked browser storage must not invalidate a real cookie session or a successful server preference save.

There is no password-reset, mailbox-verification, MFA or production social identity adapter. Plan these with your identity provider before a public identity-sensitive launch. An email/password account is not verification of control of a mailbox or of a credited person's legal identity.

### Trusted privileged-account provisioning

Only an operator with server/database access may run:

```sh
# Password comes from stdin, never command-line arguments or logged output.
# Pipe from your local password manager/secret manager; do not paste production secrets into chat.
<secure-password-source> | npm run account:create -- \
  --role broadcaster --email manager@your-domain.example \
  --name 'Station manager' --stations capital-kla,cbs-kla

<secure-password-source> | npm run account:create -- \
  --role cmo --email auditor@your-domain.example --name 'Rights auditor'
```

`EAST_SOUND_ACCOUNT_PASSWORD` is an alternative private process environment input; do not commit it. The CLI validates known station IDs and explicitly uses the trusted provisioning path. It prints only created status, ID, role and station IDs. Revocation is server-side: setting `auth_users.disabled` in a reviewed operator procedure immediately invalidates existing sessions. There is no self-service role or station-assignment endpoint. Back up and audit operator changes.

### Development-only mock OAuth

Set `EAST_SOUND_MOCK_OAUTH=1` for local development to show Google/Microsoft **simulations**. They do not contact those services or verify identity. They always create marked mock artist accounts. The flow and existing mock sessions are disabled under `NODE_ENV=production`, Vercel or static export. Mock accounts cannot deliver real masters/reserve tags, co-sign real agreements or dispatch live notifications. Use email/password for functional delivery tests; never treat the mock flow as production OAuth.

## Master delivery and contributor approvals

1. Upload MP3/WAV, up to **83,886,080 bytes (80 MiB) per file**. The browser actually decodes audio with Web Audio / `OfflineAudioContext`. A worker computes a mono 11,025 Hz RMS envelope (128 bins) and 128 × 8 FFT-band features from at most the first 120 seconds. Full-file SHA-256 and canonical feature SHA-256 bind the signature. The browser analysis budget is 30 minutes. Undelivered local file/draft state is not durable across page reloads.
2. Supply recording metadata and an ISRC, or reserve a unique persistent local `UG-ESD-26-XXXXX` tag (year follows the release date). This is a local format allocation, **not official ISRC registration**.
3. All master/performance/mechanical pools independently total 100%. A new agreement freezes credits, allocations, source hash and feature hash. Share each collaborator's private invitation yourself; no invite email is sent automatically.
4. Each collaborator must sign in to their own matching account, type their credited name and attest to the immutable version. An owner cannot approve a co-writer's allocation. Only hashed 256-bit invitation tokens are persisted; invitation expiry is seven days. Approval writes are serialized. Metadata/audio/split edits require a new version and fresh approvals.
5. Delivery validates source bytes, container/MIME/size, feature digest, ownership, approvals and the exact immutable binding, then saves metadata and private master bytes. Safe retries cannot create a second master for the same contract. Audio GET/range and DELETE are owner-only. PostgreSQL soft deletion retains historical audit/bytes pending an explicit retention policy; file-mode deletion removes the local master.

These content features are **not production acoustic recognition**, independent server recomputation of PCM, rights verification, legal identity certification, official ISRC registration or a regulated e-signature service. The server binds the supplied features to the submitted source hash and signed version; it does not run an independent trusted decoding/recognition service. Recordings start with zero observed airplay. A licensed external matching/capture integration must supply real events.

Private invitation query tokens should be treated as secrets: `no-referrer` headers/metadata are set, but server/proxy access logs, browser history and manually shared URLs must be redacted or retained appropriately. Do not place URLs/tokens in analytics or third-party logging.

## Capture, licensed playback and evidence

`POST /api/playout` uses the independent **server-side integration Bearer token**, never a browser's displayed role. Ingestion accepts validated stable IDs, known stations, matched catalogue IDs, non-future dates and `source: "captured"`. Replays are deduplicated; changed reuse of an immutable provider ID is rejected. No authorized player action claims to identify/capture a song.

Station managers store authorized public HTTPS native/HLS source URLs in their private account. The browser connects only after an explicit Open feed action. Actual source licensing, CORS, codec support, source availability and an upstream capture/matching service remain external requirements.

Real logged evidence needs its own public HTTPS clip URL, SHA-256 and ten-second duration. The HTML5 player checks the decoded duration and stops at ten seconds; optional bounded CORS/hash verification plays the verified downloaded bytes. A matching digest demonstrates integrity, not provenance or legal rights. Missing evidence never borrows a demo sample.

**Retained named examples:** Mukisa Collective / “Mulongo”, Ray Bwete / “Kampala Nights”, Capital FM, CBS FM and UPRS remain in the clearly labeled demo studio. The ten-second embedded WAV and MP3 are generated instrumental tones, not the artists' recordings or station feeds. The WhatsApp phone-frame preview logs only in-memory simulated spins, with chat bubbles such as `🔥 Airplay Alert! 'Mulongo' just played on Capital FM (Kampala)`. It never writes to capture, royalty, official affiliation or live provider ledgers. BARANGA, MR FALLBACK, SOUNDLYKBB and TAI DAI sourced release references remain intact.

## Preferences, automatic outbox and live delivery

The artist settings UI saves to authenticated `/api/preferences`; saving is no longer a browser-only export or a fake provider connection. Recipients need explicit opt-in. Watches can target only the account's own recordings. Activation timestamps are server controlled; existing history informs counters without retrospective sends. Account-owned `/api/notifications/outbox` shows queued/attempted/retry/accepted status, not destinations or secrets.

Webhook secrets are write-only, encrypted AES-256-GCM server-side, and redacted from responses/client caches. Use a cryptographically random secret of at least 32 characters per endpoint. Endpoint changes require a new secret. Shared HMAC covers `timestamp + '.' + rawBody`, with `X-East-Sound-Timestamp`, `X-East-Sound-Signature` and stable idempotency headers. Validate a five-minute timestamp window, timing-safe MAC comparison and replay/idempotency before processing downstream. See [transport contracts](notifications-and-capture.md).

A new captured spin automatically enqueues eligible opted-in jobs. PostgreSQL commits captures/counters/outbox atomically; file mode reconciles from persisted captured history with stable deduplication keys to recover a crash between its separate commits. The file security store uses an atomic heartbeat lock across web/worker/provisioning processes on one durable host, plus 0600 writes and atomic rename. Use PostgreSQL for multiple web writers/hosts and for production-scale audit/outbox workloads; file catalogue/ISRC/capture operations are still single-web-process storage, not a distributed database.

Workers re-check current ownership, consent/generation, active recipients and disabled/mock accounts. Provider I/O occurs outside locks/transactions. Leases are 120 seconds; failures use bounded retries/backoff. A finished worker must still own its lease. Provider acceptance is not handset/email delivery or a read receipt. A crash after remote acceptance but before local acknowledgement can cause an at-least-once retry; downstream idempotency and delivery callbacks are needed. No provider is contacted just by building or saving settings.

Set the server's provider credentials, exact webhook-URL allowlist and `EAST_SOUND_SECRET_KEY`, then deliberately enable `EAST_SOUND_LIVE_NOTIFICATIONS=true` and `EAST_SOUND_WORKER_ENABLED=1` under a process supervisor. `npm run worker:notifications -- --once` processes one batch; omit `--once` for the supervised polling worker. Leave live sends disabled in QA. Provider-unconfigured jobs remain pending without consuming delivery attempts. Do not use placeholder credentials or expose worker/integration tokens to the browser.

## CMO review and production storage

`/api/rights-reviews` is CMO-only with CSRF on POST. A server-clock, account-bound, immutable decision records the referenced agreement/binding, rationale and reviewer. A request UUID makes retries idempotent. Decision and audit entry commit together. Public/unknown or local-only rights cannot be marked as reviewed. Corrections require fresh contributor approvals, not silent share edits. This is not adjudication, UPRS certification, an actual payment/hold or a statutory tariff determination.

Use [PostgreSQL/worker setup](postgres-and-worker.md), then explicitly run migrations **001 and 002** and the reference seed before serving accounts. New account/session/document/audit tables do not migrate an old public master into an artist's ownership. Never derive ownership from artist-name matching. Plan a reviewed backfill for any genuine legacy deliveries. Keep application, uploads, encrypted-secret key and database backups consistent and test restoration.

On a persistent Node host, `npm run build` then `npm run start -- --hostname 0.0.0.0` supports the full 80 MiB workflow. The process needs a durable private master volume even with PostgreSQL. New local metadata/master files use 0600 permissions and new private directories use 0700. Audit existing volume ownership/permissions separately; creation defaults do not retroactively change legacy files. Vercel/PostgreSQL also supports the [authenticated private Blob adapter](cloud-masters-and-live-delivery.md) when the private store and explicit mode are configured. It streams source verification and playback and never treats ephemeral disk as durable. Delivery remains disabled when that configuration is missing or a store fails its private-access probe. Static export deliberately contains only public charts/statistics and an unavailable sign-in view, no private pages/API/datastore. Do not advertise the static showcase as the authenticated application.

Build/test with the development toolchain, then use production-only runtime dependencies (for example a reviewed multi-stage image). `npm audit --omit=dev` checks that runtime set; it does not certify the separate development/legacy Prisma draft toolchain, which must be assessed independently before upgrades.

Before real launch, additionally configure mailbox verification/password recovery/MFA or a real identity provider, licensed recognition/evidence, provider delivery callbacks, TLS/edge abuse controls, monitoring, backup/retention/purge and data-subject procedures, operational security review and any required rights/society/legal agreements. Repository tests do not certify those external or operational prerequisites.

## Provider onboarding and signed webhook inbox

The private `/dashboard/alerts/setup` page separates operator-only provider credentials from per-account inbox management. See [the onboarding/inbox guide](notification-onboarding-and-inbox.md). Additive migration **003** is explicit and creates receiver/receipt tables only; no DDL runs on requests or normal builds. Receivers require PostgreSQL, owner/role/CSRF checks, encrypted one-time keys and valid HMAC/time windows. Signed external claims remain unverified integration data, never captures, royalties or outgoing queue jobs. The local verifier button is in-process, not a provider/network delivery test. Meta/Resend approvals, a verified sending domain, consent and deliberate live activation remain external setup tasks.

## Verification

```sh
npm run typecheck
npm run lint
npm test
npm run test:postgres      # isolated embedded PostgreSQL, no remote DB or provider sends
npm run build
npm run build:static       # run builds serially
npx playwright install chromium
npm run test:browser      # isolated local server at 127.0.0.1:3010; dedicated .data/qa store
```

For an already running isolated local server, provide `EAST_SOUND_TEST_URL`, matching `EAST_SOUND_E2E_DATA_DIR`, and `EAST_SOUND_E2E_INGEST_TOKEN`. Role fixtures explicitly refuse non-loopback hosts and non-QA data paths. The browser suite performs real authenticated delivery and injects **test-only** capture fixtures only into that dedicated store; it never sends external notifications. It verifies real WAV/MP3 decode, independent approvals, RBAC/data isolation, session/cache eviction, blocked localStorage, media/evidence, automatic jobs and retained simulations. Do not aim it at production. `npm run test:deployment` is the separate non-mutating public/reference smoke suite.
