# East Sound

A responsive **East Africa Airplay Analytics Platform**, with a Uganda-focused station directory, sourced Ugandan releases, master delivery, capture-backed reporting, and **Airplay Alerts & Webhooks**.

Built with Next.js 16, React 19, TypeScript and Tailwind CSS 4. This is an integration-ready prototype with a default single-process file backend and an opt-in PostgreSQL capture/outbox backend—not a connected national monitoring service, rights registry or certified BMAT/UPRS product.

## Run locally

```bash
npm ci
npm run dev -- --hostname 0.0.0.0
```

Open `/dashboard/artist`. For a production server, use `npm run build` followed by `npm run start -- --hostname 0.0.0.0`.

```bash
npm run typecheck
npm run lint
npm test
# Disposable local PostgreSQL; no production connection or real provider sends:
npm run test:postgres
# With the application running and a Playwright Chromium installed:
npx playwright install chromium
npm run test:browser
```

The browser suite exercises the UI, mobile overflow, master delivery and cleanup, notification configuration, PDF downloads, source setup and intercepted test-only evidence. It does not send provider messages or write simulated broadcasts into the capture store. Use a separate `EAST_SOUND_DATA_DIR` when testing deployments.

## Workspaces

The shell offers **Artist & Label Portal**, **Broadcaster Playout Log**, **CMO & UPRS Regulatory Auditor**, and **Advertiser Spot Tracker**. These are browser-saved **view preferences, not authentication or authorization**.

| Route                           | Capabilities                                                                                                                         |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `/dashboard/artist`             | Overview; five KPIs; Uganda map; master delivery; real release catalogue; artist library                                             |
| `/dashboard/artists`            | BARANGA, MR FALLBACK, SOUNDLYKBB and TAI DAI profiles, credited releases, citations, consent-based Apple Music player, reference CSV |
| `/dashboard/playout`            | Captured FM/TV logs; search, match, station, region and period filters; ten-second evidence; logging-sheet CSV                       |
| `/dashboard/monitoring`         | Authorized, user-configured native/HLS station playback, source management, captured activity and regional filtering                 |
| `/dashboard/alerts`             | Subscriptions, WhatsApp binding and simulator, email/PDF digests, templates and signed webhook configuration                         |
| `/dashboard/cmo`                | Captured rights allocations, multi-select filters, daypart policies and compliance-review exports                                    |
| `/dashboard/splits`             | Supplied master splits and local collaborator acknowledgements                                                                       |
| `/dashboard/analytics/regional` | Central, Eastern, Western and Northern Uganda filters, schematic map and capture-backed hub totals                                   |
| `/dashboard/charts`             | Connected-panel rolling seven-day rankings and prior-period comparison; unknown historical peaks stay blank                          |
| `/dashboard/royalties`          | Indicative captured-play statements; initially pending; settlement actions are explicitly local-only                                 |
| `/dashboard/advertisers`        | Clearly labelled ad-contract/spot-audit **simulation**, not actual brand buys or detected spots                                      |
| `/dashboard/mix-parser`         | Integration-required state; no generated real-artist identifications                                                                 |

### Five shared KPIs

- Total audited capture records, with matched and reporting-station counts.
- Top performing station by matched plays.
- Peak four-hour airplay window in East Africa Time.
- Active notification subscriptions: enabled, valid rules with at least one locally configured, opted-in channel. **Not provider connectivity or delivery.**
- Flagged unmatched audio, determined by catalogue match rather than by presence of an ISRC.

The Uganda country outline is public-domain Natural Earth geometry. The four regional divisions are schematic—not official administrative boundaries. Streaming/search, audience measurement, cross-border monitoring and hit predictions are not inferred from public artist metadata.

## Real releases, not fictional artist activity

The application now starts with **12 sourced public-release references** from the four requested artist profiles. Exact co-leads, featured credits, edition dates, genres and durations are retained. The provenance registry contains 15 Apple Music sources, reviewed on **1 November 2026**; see [artist research](docs/artist-research.md).

- Unknown ISRCs remain empty; reference records have no master file, format, ownership, approved signatures, spins or royalties.
- The old seven asset-less demo catalogue rows are migrated on read. Matching legacy IDs and local tags identify those rows; genuinely stored masters and unrelated deliveries are retained. The migration is idempotent and never resets corrupt data.
- Reference links and published ℗ credits are **not licences, endorsement or proof of ownership**. No music is downloaded or rehosted. Apple playback loads only after explicit consent; availability and playback length depend on Apple and the user's account/region.
- Generic algorithm fixtures live only under `tests/fixtures/`. Production data paths do not generate artist airplay, default rights shares or fabricated society membership.

## Delivery and rights

Stage multiple **WAV/MP3 files up to 80 MiB each** (80 × 1024 × 1024 bytes). The workflow validates extensions/MIME, audio signatures and browser decoding, previews staged audio, and reserves unique local `UG-ESD-YY-XXXXX` tags. These allocations are **local identifiers, not authorized registry assignments**. Supply an existing verified ISRC when applicable.

Master, performance and mechanical ownership pools must each total 100%. Add collaborators, co-writers, producers and publishers; record matching typed-name approvals after the agreement is valid. Changes clear approvals. The server revalidates files, metadata, shares and approvals before storing a master. These are local acknowledgements—not independently authenticated collaborator signatures or proof of rights.

New deliveries start **processing, with zero observed spins**. Uploading a master does not capture a station, generate airplay or earn a royalty. Focusable tooltips and onboarding explain ISRC versus ISWC and performance versus mechanical rights.

## Captures, playback and evidence

The dashboard reads an initially empty captured-event store. A protected `POST /api/playout` accepts validated, explicitly `source: "captured"` integration records; `GET /api/playout` exposes the captured feed. See [integration contracts](docs/notifications-and-capture.md).

Activity views use **the current EAT day and thirteen prior days** and poll every 15 seconds in visible tabs. Invalid/unavailable responses retain the last good snapshot with a stale-data notice. Missing data is never replaced with demo activity.

Station sources are public HTTPS native/HLS URLs entered by an authorized operator and saved in their browser. No default broadcaster stream, false uptime/latency or fabricated "online" status is provided. Opening a source allows browser playback; **playback is not recording, matching or fingerprint recognition**. Provider CORS, transport format and browser support still apply.

A capture can include a ten-second evidence URL and SHA-256. Missing clips disable evidence actions. The player validates the supplied duration and stops at ten seconds. An explicit, CORS-based verification downloads at most 16 MiB within 15 seconds, compares SHA-256, and plays the verified downloaded bytes when successful. A matching hash proves byte integrity only—not provenance, recognition, ownership or broadcaster attribution. Real captures never receive synthesized fallback audio.

## CMO review and illustrative allocations

Captured, deduplicated plays enter the allocation ledger only with a supplied valid ISRC and complete locally approved ownership. Local `ES-...` holder IDs are not verified UPRS membership. Integer remainder allocation conserves the modelled UGX pool.

The default time policy is **prime 1.5× / standard 1× / night 0.8×**:

- Prime: 06–10 and 16–20 EAT.
- Standard: 10–16 and 20–22 EAT.
- Night: 22–06 EAT.

These are configurable illustrative windows/weights, not verified programme schedules or published UPRS tariffs. The monthly allocation view includes the current and five previous EAT calendar months, using actual capture timestamps rather than a synthetic monthly daypart mix. Incomplete rights/identifiers remain unallocated.

Logging-sheet CSV exports include EAT times, identifiers, supplied metadata, confidence, evidence status, daypart and illustrative amounts. Unknown ISWCs, composition and programme fields remain blank for review. Exports are formula-safe, **not official UPRS filing templates, certified audit reports, payment instructions or amounts owed**. Royalty approval/"paid" marks are page-memory simulations; no bank transfer or persisted settlement is performed.

## Airplay Alerts & Webhooks

The dedicated notification center and global configuration modal support:

- Validated international WhatsApp recipients, including **+256 plus nine subscriber digits**, explicit opt-in and customizable message templates.
- First captured FM play, exact lifetime FM milestones (100/1,000 by default), and morning/drive-time drops on **Capital FM, CBS FM and Galaxy FM**.
- Per-recording, station and regional scopes; create/edit/pause/resume/delete subscriptions; local persistence and cross-tab synchronization.
- A **Test WhatsApp Notification** phone preview, clearly labelled simulated and excluded from metrics, captures and live dispatch.
- Completed-EAT-day morning recaps and completed-seven-day regional trends, with genuine selectable-text **PDF exports** and configurable email scheduling.
- Label webhook destinations for JSON backends, Discord and Telegram **relays**, payload previews and consented private worker-configuration downloads.
- Server-only Meta WhatsApp template messages, Resend email/PDF attachments and signed webhook adapters, protected by explicit environment configuration and a private worker token.

Saving preferences does **not** send messages, register a phone with Meta, connect a provider, or provision a scheduler. Subscriptions start at activation; pre-activation captures inform counters without retrospective sends. Editing/resuming starts a new activation window. Provider acceptance is not handset/email delivery or a read receipt.

Read [notification/capture setup, environment variables, API examples, signing and retry semantics](docs/notifications-and-capture.md) before enabling any outbound integration.

## Vercel deployment and release verification

The repository includes a Next.js `vercel.json` and pins Node 22. Link `mikeo-ne/BMAT` to your Vercel project with `main` as the production branch. GitHub Pages remains a separate `/BMAT` static showcase.

**Vercel has no durable local filesystem.** Without explicitly configured PostgreSQL, the Vercel app serves the 12 public references directly in read-only mode—no `.data` writes, fake captures or `/tmp` upload success. The dashboard displays this boundary, disables capture polling and master delivery/tag allocation, and keeps browser-local channel settings, simulations, source previews and PDF exports available. `GET /api/health` reports the deployed commit, storage mode and actual supported capabilities without secrets. Selecting PostgreSQL with bad/missing configuration fails closed instead of reverting to references.

Even with PostgreSQL, Vercel master catalogue mutations stay disabled: the 80 MiB master workflow needs authenticated direct-to-object-storage uploads (Vercel function request-body limits apply), not ephemeral function disk. The existing 80 MiB workflow remains available on a properly authenticated Node host with durable storage. Do not enable live messages or import/migrate a production database merely to pass a deployment check.

After a deployment, run the **Verify Vercel deployment** GitHub Actions workflow with its approved HTTPS origin and exact commit SHA, or locally with an installed Chromium:

```bash
EAST_SOUND_TEST_URL=https://<your-deployment>.vercel.app \
EAST_SOUND_EXPECT_COMMIT=<deployed-40-character-sha> npm run test:deployment
```

This read-only-cloud smoke suite checks health/commit identity, eleven dashboard routes, the honest catalogue/empty capture feed, rejected mutations, browser notification controls/simulator/PDF downloads and mobile delivery safeguards. It does not create a master, reserve a tag, inject a capture or send a real notification. It does not bypass deployment protection; a protected site needs authorized access before anonymous verification can pass.

## Persistence, deployment and boundaries

By default the live Node server uses `EAST_SOUND_DATA_DIR` (default `.data/`, ignored by Git) for:

- `tracks.json`, `uploads/` and `isrc-reservations.json`.
- `broadcasts.json`—captured records only, immutable by provider event ID.
- `notification-attempts.json`—bounded delivery metadata without recipient addresses, message bodies, destination URLs or secrets.

JSON mutations are atomic and serialised **within one Node process**. Corrupt files are not reset. Serverless/ephemeral filesystems and multiple replicas do not provide safe shared file persistence.

### Optional PostgreSQL and polling worker

Set `EAST_SOUND_STORAGE_BACKEND=postgres`, a verified-TLS `DATABASE_URL` and a non-nil `EAST_SOUND_TENANT_ID`, then explicitly run:

```bash
npm run db:migrate
npm run db:seed
# Only after real provider configuration, consented rules and explicit live enable:
npm run worker:notifications
```

The dedicated SQL migration/repositories persist catalogue, tenant-scoped captures, local ISRC reservations and a transactional notification outbox. Monthly partitions, global provider-event deduplication, atomic FM counters and complete partition-key foreign keys avoid the sample's first-spin count race. Workers use `FOR UPDATE SKIP LOCKED`, renewable/fenced leases, bounded backoff/dead letters and the existing approved-template/Resend/signed-webhook adapters. Daily/weekly HTTP digests retain their scheduler contract with shared PostgreSQL attempt leases. No mock send is recorded as success.

Browser settings must be privately registered through authenticated `/api/notifications/rules`; PostgreSQL instant HTTP dispatch consumes committed jobs rather than rescan-and-send. This is opt-in: no database is provisioned, private JSON imported, capture fabricated or real message sent automatically. Existing genuine files require a reviewed import before switching. Static export remains public-reference-only.

Read **[PostgreSQL setup, migration, rules, worker, retention and security boundaries](docs/postgres-and-worker.md)** before enabling it. `prisma/schema.prisma` remains an unwired historical draft, not this active SQL schema. Master bytes still require durable filesystem/object storage. Database tenant columns and worker tokens are **not end-user authentication or RLS**. Add actual access controls, authenticated approvals, licensed capture, provider callbacks, monitoring and tested backup/retention before production.

`npm run build:static` creates `.static-build/out/` with the `/BMAT` base path by default. It excludes environment files, API routes and private runtime data; disables capture polling/provider readiness; and seeds only public reference metadata. Set `BASE_PATH` if needed. Static hosting cannot ingest captures, reserve server tags, store masters or dispatch messages; browser-local configuration, reference browsing and PDF export remain available.

**Do not expose this prototype's catalogue/upload mutation APIs publicly without gateway authentication and tenant/access controls.** Role-view switching is not security. Before a public launch, add operational monitoring, retention policies, encrypted secret/config storage, backup/recovery and provider delivery callbacks. No real broadcaster capture, authenticated artist signature, provider account, official tariff, BMAT certification or UPRS endorsement is implied by this checkout.
