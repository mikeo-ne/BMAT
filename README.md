# East Sound

An East Africa airplay workspace built with **Next.js 16, React 19, TypeScript and Tailwind CSS 4**, with authenticated Node APIs, scoped persistent storage and an opt-in PostgreSQL capture/outbox backend.

## Start locally

```sh
npm ci
# Optional: cp .env.example .env, then set your browser-visible origin.
npm run dev -- --hostname 0.0.0.0
```

Open `/dashboard/charts` as Public Guest, or `/login` to create an Artist / Label Manager account. Set `EAST_SOUND_APP_ORIGIN` to the browser-visible origin when running behind a proxy. `.data/` contains private local accounts, catalogue, uploads and outbox state; keep it on a private durable volume and out of Git. Use Node 22.

**[Fullstack setup, account provisioning, security boundaries and launch checklist →](docs/fullstack-operations.md)**

## Implemented workflows

- **Authoritative authentication/RBAC:** email/password, salted scrypt, opaque HttpOnly sessions, CSRF/origin checks, persistent guessing limits and server-side account/station filtering. localStorage is display-only, not a role selector or bearer-token authority. Development mock Google/Microsoft OAuth is visibly simulated and disabled in production.
- **Four security roles:** Public Guest sees national charts/statistics; Artist / Label Manager sees owned masters/analytics/preferences; Broadcaster / Station Manager sees only assigned station logs/sources/ad planning; CMO Auditor sees global allocation/audit ledgers and rights reviews. Privileged accounts are created by the operator CLI, never self-selected during sign-up.
- **Actual MP3/WAV processing:** up to **80 MiB per file**, browser `OfflineAudioContext` decoding, waveform RMS/FFT features in a worker, full-file and feature SHA-256, and persistent unique `UG-ESD-26-XXXXX` format tags. Tags are local allocations, not official registration; features are not a licensed production recognition service or proof of rights.
- **Independent split sign-off:** immutable source/metadata/three-pool agreements, hashed private invitations, independent account approvals and owner-only master delivery/playback/range/withdrawal. Owners cannot approve a collaborator's allocation. Material edits need fresh approvals.
- **Monitoring/evidence:** account-persisted authorized native/HLS sources, explicit HTML5 playback, captured-only station logs and ten-second evidence playback with optional bounded SHA-256/CORS verification. Licensed feeds and upstream capture/matching remain external integrations.
- **Automatic notifications:** account-persisted consent/subscriptions, event-driven outbox enqueue, owned-recording watch scopes, encrypted write-only webhook secrets and server-only signed/provider adapters. Leases, bounded retries, deduplication and revocation checks are implemented. Queued/accepted does not mean delivered/read. Actual sends require explicit live/worker enable and configured, approved providers. Post-capture dispatch and authenticated daily retry/cleanup are implemented; prompt retries need a more frequent external scheduler or supervised worker.
- **Private integration setup/inbox:** operator guidance for Meta Cloud API and Resend, per-artist encrypted one-time webhook keys, HMAC/timestamp checks, durable signed-ID deduplication, rotation/disable and minimized private receipts. Incoming claims/configuration tests never become captures or outbound sends; migration 003 is required for this receiver.
- **Persistence and responsive UI:** file or PostgreSQL authority, user-scoped IndexedDB/localStorage snapshots, account-change/logout eviction, blocked-storage fallbacks, four Uganda regions, filtered/re-ranked airplay views, accessible mobile navigation and real deep links.
- **CMO review:** capture-backed ledgers, EAT dayparts, illustrative allocation/CSV/PDF exports and immutable, idempotent CMO split-review decisions with atomic audit records. Review does not silently rewrite signed contributor shares, impose statutory holds or transfer money.

## Retained data and honest simulations

**Mukisa Collective, Ray Bwete, Capital FM, CBS FM and UPRS** remain in the clearly labeled demonstration studio. Hear a generated ten-second sample, open demo evidence and preview a WhatsApp phone conversation, including:

> 🔥 Airplay Alert! 'Mulongo' just played on Capital FM (Kampala)

These demo actions stay in memory: they do not invent live captures, royalties, provider sends, society membership or endorsements. The embedded sample is generated instrumental audio, not the named artists' music.

The **12 sourced release references** for **BARANGA, MR FALLBACK, SOUNDLYKBB and TAI DAI** are preserved, with source links and unknown identifiers/rights kept unknown. [Artist research and edition matching](docs/artist-research.md). Public artist metadata and published ℗ credits do not establish ownership, licensing or airplay. No public artist recording is downloaded or rehosted. Optional Apple playback requires explicit consent and depends on the provider/account/region.

Public statistics expose only the permitted minimized public scope. Private deliveries are not published to national charts unless the owner explicitly opts in. Missing capture data is labeled missing—not replaced by fabricated observed activity. The Uganda outline uses public-domain Natural Earth geometry; the four regional divisions are schematic rather than official administrative boundaries.

## Accounts and integrations

Artist sign-up is self-service. Use a secure local password source with the trusted provisioning CLI for other roles:

```sh
<secure-password-source> | npm run account:create -- \
  --role broadcaster --email manager@your-domain.example \
  --name 'Station manager' --stations capital-kla,cbs-kla

<secure-password-source> | npm run account:create -- \
  --role cmo --email auditor@your-domain.example --name 'Rights auditor'
```

Never put real passwords or provider tokens in command arguments, source, chat, browser storage or exported configs. The CLI also accepts the private process variable `EAST_SOUND_ACCOUNT_PASSWORD`. A login account is not proof of legal identity or mailbox ownership. Real OAuth, mailbox verification, recovery and MFA are not supplied by the mock flow.

- [WhatsApp/email onboarding and private webhook inbox](docs/notification-onboarding-and-inbox.md)
- [Private cloud master uploads and live-delivery setup](docs/cloud-masters-and-live-delivery.md)
- [Authenticated fullstack operations and security model](docs/fullstack-operations.md)
- [PostgreSQL migrations, capture transactions and workers](docs/postgres-and-worker.md)
- [Capture API, notification providers, HMAC and evidence contracts](docs/notifications-and-capture.md)

The default Node store is suitable for a single durable web host. The security/outbox store is locked across its local worker/CLI processes; catalogue/capture/ISRC storage is not a distributed multi-writer database. Use the opt-in PostgreSQL backend for multi-process/host production workloads. Do not infer ownership of old public/unowned rows from an artist's display name; plan any legacy backfill explicitly.

## Verification

```sh
npm run typecheck
npm run lint
npm test
npm run test:postgres
npm run build
npm run build:static  # run builds serially
npx playwright install chromium
npm run test:browser
```

The authenticated browser suite starts an isolated local server on port **3010** by default, with its own ignored `.data/qa` directory. It tests real audio decoding/delivery, separate collaborator sessions, RBAC, private audio/evidence, persisted preferences, automatic test-capture jobs, cross-tab logout/cache isolation and mobile layouts. Synthetic test captures are confined to that isolated store; no external provider is sent a message. Do **not** point it at production. To use an already-running local QA server, set `EAST_SOUND_TEST_URL`, matching `EAST_SOUND_E2E_DATA_DIR` and `EAST_SOUND_E2E_INGEST_TOKEN`. PostgreSQL tests use a temporary embedded database and mocked transports, not a production database.

The separate, non-mutating reference-deployment smoke suite is:

```sh
EAST_SOUND_TEST_URL=https://your-approved-project.vercel.app \
EAST_SOUND_EXPECT_COMMIT=<expected-full-git-sha> npm run test:deployment
```

It checks public charts/statistics, capability/commit identity, unauthorized API rejection and private-page sign-in gates. It does not provision an identity, inject a capture, reserve a tag or contact a notification provider.

The new provider-onboarding/private-inbox checks are recorded in [the notification setup verification report](docs/notification-onboarding-verification.md). Cloud-adapter and notification-execution checks are recorded in [the cloud delivery verification report](docs/cloud-delivery-verification.md). The earlier [fullstack verification report](docs/fullstack-verification.md) retains the historical baseline checks and launch boundaries.

## Deployment boundaries

A **persistent Node host** supports the full 80 MiB delivery workflow: configure a private durable master volume, origin/TLS, datastore and keys; explicitly migrate/seed PostgreSQL if selected; then build/start the app and supervise the worker. See the launch checklist before enabling real sends.

**Vercel without PostgreSQL** remains a read-only reference deployment. **Vercel with PostgreSQL and an explicitly configured PRIVATE Blob store** supports authenticated direct multipart master delivery up to 80 MiB, server-side streamed checksum validation, atomic agreement/catalogue/audit completion, and owner-only range playback. Missing/unsafe storage still disables delivery. Raw masters never pass through a serverless upload request or `/tmp` success path. [Cloud setup, retention, consent and scheduler limits](docs/cloud-masters-and-live-delivery.md). `/api/health` reports actual storage/capabilities without secrets. Selecting a broken PostgreSQL connection fails closed rather than falling back to JSON/references.

`npm run build:static` creates `.static-build/out/` with `/BMAT` by default. It excludes APIs, private pages, environment files and runtime data. Only public charts/statistics and an unavailable sign-in view are exported. Static hosting cannot authenticate, deliver masters, ingest captures, store private settings or dispatch notifications.

No production migration, provider send, official ISRC registration, licensed capture/recognition connection, legal rights certification, BMAT certification, society affiliation or deployment is implied by a successful build. Real launch additionally needs identity hardening, licensed upstream data, provider callbacks, observability, tested backup/retention/purge procedures, abuse controls and operational/legal review. Payment/paid markers and the existing ad-campaign planning model remain explicitly illustrative, not real settlement or ad recognition.
