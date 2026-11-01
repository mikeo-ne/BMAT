# Airplay Alerts & Webhooks: integration contracts

East Sound separates public release metadata, authenticated account preferences, authorized capture ingestion and server-only provider dispatch. **No live providers or station streams are supplied by default.** Never place provider/bot/worker tokens in client settings, `NEXT_PUBLIC_*`, screenshots or Git. Per-endpoint webhook HMAC secrets may be entered once into the write-only settings field; the server encrypts and redacts them, and the client never persists or exports them. See [authenticated fullstack operations](fullstack-operations.md) for sessions, role isolation and account setup.

**Account workflow:** authenticated `/api/preferences` saves immediately activate/revoke account-owned watches. New captures automatically queue eligible jobs in the file or PostgreSQL outbox; run the supervised `worker:notifications` CLI to drain them. No configuration export or administrative token is needed in the browser.

**Administrative compatibility:** the `instant` + `config` HTTP examples below describe the older, separately privileged file-backend scheduler, not the account outbox. Do not run overlapping legacy and account watches for the same recipient. PostgreSQL HTTP instant dispatch instead drains committed outbox jobs; see [PostgreSQL rules, migrations and worker](postgres-and-worker.md). Daily/weekly scheduling remains an explicit operator integration. The metadata-only legacy attempt ledger is distinct from account documents/queues and the PostgreSQL payload-bearing outbox.

## 1. Configure a capture pipeline

A licensed capture/fingerprint service must do the actual recording and matching. East Sound supplies the validated ingestion boundary and reporting UI—not an independently verified reference fingerprint index.

Set a unique, random server-side `EAST_SOUND_INGEST_TOKEN` of at least 32 characters. Keep it distinct from the notification-worker token.

`POST /api/playout` requires `Authorization: Bearer <token>` and `Content-Type: application/json`. Requests are limited to 256 KiB and 1–100 records, validated atomically. For example, an actual integration would send this shape, with its own observed timestamp, provider ID, duration/confidence and optional evidence:

```json
{
  "records": [
    {
      "id": "your-provider-event-id",
      "source": "captured",
      "stationId": "capital-kla",
      "detectedAt": "2026-11-01T07:00:00.000Z",
      "trackId": "ref_baranga-salo",
      "isrc": null,
      "durationSec": 154,
      "confidence": 0.98,
      "evidence": {
        "url": "https://your-evidence-host.com/ten-second-excerpt.wav",
        "sha256": "replace-with-the-actual-64-character-sha256-hex-digest",
        "durationSec": 10
      }
    }
  ]
}
```

**This is a schema illustration, not a captured airplay claim.** Do not submit it as activity. Omit `evidence` if no lawful, ten-second excerpt exists; the placeholder digest intentionally fails validation. Obtain genuine matched recording IDs through an authorized operator/catalogue workflow (`GET /api/tracks` is artist-session/owner-scoped, not an ingestion-token enumeration API); station IDs come from `lib/regions.ts`, with `nbs-tv-kla` additionally supported for TV.

Validation rules:

- Source must be explicitly `captured`; demo/simulator events are rejected, not relabelled.
- Provider IDs are stable, 1–160 ASCII alphanumeric/colon/underscore/hyphen characters. Existing IDs are immutable and idempotent; duplicate retries do not alter the original record. Send final capture/match results, not provisional updates under the same ID.
- Stations and catalogue IDs must be known. Use `trackId: null` for unmatched audio. Server-controlled title, artist, medium and region are derived from the catalogue/station—not accepted as client overrides.
- Timestamps require an explicit timezone, a valid calendar date, no future instant and no date before the selected release edition. Values are normalized to UTC; reports display EAT.
- Duration must be finite, positive and at most 86,400 seconds; supplied confidence must be 0–1. Confidence is an ingester assertion, not independently calculated by East Sound.
- Supplied ISRCs must validate. Missing ISRCs remain null; a known catalogue match does not require an invented ISRC.
- Evidence must have a public HTTPS URL, actual SHA-256 and `durationSec: 10`. The ingestion API validates the reference—not the remote media or provenance. Browser verification additionally requires provider CORS, supports at most 16 MiB and has a 15-second bound.

Responses: `201 {inserted, duplicates}`, `401` invalid credentials, `503` disabled integration/unavailable store, `415` content type, `413` size limit, `400` malformed JSON, `422` invalid records; PostgreSQL additionally returns `409` for changed reuse of an immutable provider event ID. No partial batch is saved on a validation error.

`GET /api/playout` returns `{source: "captured-only", records, generatedAt, notice}`. No file means an empty feed; malformed data returns an error without overwriting the file. Reads require a real account session and are filtered to the artist's owned tracks or the broadcaster's assigned stations; only CMO auditors receive the workspace-wide feed. Query/body/localStorage role or owner claims cannot expand that scope. Public charts/statistics expose only minimized public data, never evidence URLs.

## 2. Configure recipients and subscriptions

Open **Airplay Alerts & Webhooks → Configure channels**, or the global header shortcut.

- WhatsApp: an international E.164 number, Uganda `+256` plus nine digits without the local leading zero, and explicit recipient permission.
- Email: a valid consenting recipient, daily/weekly enable flags, EAT hour and weekly weekday (Monday by default).
- Webhooks: up to ten named public HTTPS destinations. Use Discord webhook URLs or an authorized Telegram/internal **relay**. Never paste a Telegram bot token into this browser interface; the relay owns its token and chat configuration.
- Templates: up to 1,000 characters with supported `{{title}}`, `{{artist}}`, `{{station}}`, `{{location}}`, `{{region}}`, `{{time}}`, `{{spinsToday}}`, `{{totalSpins}}`, `{{milestone}}` and `{{trigger}}` tokens. Rendered instant messages are bounded to 1,024 characters. Unknown/malformed tokens fail validation.
- Subscriptions: up to 100; select recording/all, station/all, region, channel(s), trigger(s) and up to 20 positive whole-number milestones.

Settings persist in authenticated server account documents. Non-authoritative IndexedDB snapshots are user-scoped and evicted on logout/account change; the old unscoped `east-sound:notifications:v1` value is not imported as authority. Blocked localStorage does not prevent a valid cookie session or successful server save. Contacts remain sensitive: secure the device and private server/backup access, and avoid sharing configuration exports. Enabled webhook destinations require a write-only 32–256 character secret; changing the endpoint requires a fresh secret.

**Active** means an enabled, valid account subscription with at least one configured, opted-in channel—not verified provider connectivity. Saving settings updates the account's rules and server-controlled activation/generation; no export is needed for automatic account alerts. The outbox reports queue/provider acceptance separately from delivered/read. Channel cards do not claim a provider handshake.

### Trigger semantics

- Only captured, matched, non-future **FM** records participate. TV, demo and unmatched events cannot trigger these music notifications.
- IDs are deduplicated; lifetime and EAT-day counters are computed **before** subscription station/region filters.
- First-ever means the first captured FM play in the available connected-panel history—not the first play on every station or all radio worldwide. PostgreSQL counts ingestion order atomically; late-arriving older history does not reorder already-admitted events or recall alerts.
- Milestones fire at exact thresholds; the default is 100 and 1,000 lifetime captured FM plays. A missing threshold record is not invented.
- Prime-time: Capital FM (`capital-kla`), CBS FM (`cbs-kla`), Galaxy FM (`galaxy-kla`), 06:00≤time<10:00 and 16:00≤time<20:00 EAT. These are configurable reporting windows, not verified programme schedules.
- A subscription's `createdAt`, or optional later `activatedAt`, bounds its notification window. Older records still count toward lifetime/day totals, but are not sent retrospectively. UI edits/resumes set a new activation time. Keep activation metadata when scheduling exported configurations.
- The **Test WhatsApp Notification** action is entirely a phone simulation. It neither contacts a phone nor increments captures/KPIs nor enters the server outbox.

## 3. Configure server providers

All values below are server-only; configure them in your runtime secret manager, not Git.

| Variable                        | Purpose                                                                                                      |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `EAST_SOUND_NOTIFICATION_TOKEN` | Independent random Bearer secret, at least 32 characters, for the private worker                             |
| `EAST_SOUND_LIVE_NOTIFICATIONS` | Must be exactly `true` to enable outbound delivery; leave unset until ready                                  |
| `WHATSAPP_ACCESS_TOKEN`         | Meta WhatsApp Business Cloud API access token                                                                |
| `WHATSAPP_PHONE_NUMBER_ID`      | Numeric Meta sender phone-number ID—not the recipient's E.164 number                                         |
| `WHATSAPP_GRAPH_VERSION`        | A currently supported account API version, `v<number>.<number>`; no version is guessed                       |
| `WHATSAPP_TEMPLATE_NAME`        | Your approved Meta template name; the adapter supplies one body text parameter containing the rendered alert |
| `WHATSAPP_TEMPLATE_LANGUAGE`    | Approved template locale; defaults to `en`                                                                   |
| `RESEND_API_KEY`                | Email provider key                                                                                           |
| `EAST_SOUND_EMAIL_FROM`         | Valid sender email in a provider-verified domain                                                             |
| `EAST_SOUND_WEBHOOK_ALLOWLIST`  | JSON array of **exact** permitted webhook URLs                                                               |
| `EAST_SOUND_WEBHOOK_SECRET`     | Random HMAC secret of at least 32 characters, shared with your relay/backend                                 |
| `EAST_SOUND_DATA_DIR`           | Durable single-process data directory; defaults to `.data/`                                                  |

Example names/format—not credentials:

```text
EAST_SOUND_LIVE_NOTIFICATIONS=false
WHATSAPP_PHONE_NUMBER_ID=<sender-id>
WHATSAPP_GRAPH_VERSION=<supported-version>
WHATSAPP_TEMPLATE_NAME=<approved-template-name>
EAST_SOUND_EMAIL_FROM=alerts@your-verified-domain.com
EAST_SOUND_WEBHOOK_ALLOWLIST=["https://your-relay.com/airplay"]
```

Readiness checks only validate the presence/shape of configuration. No credentials, template approval, sender verification or external connection are independently tested by loading the UI. Provider failures are recorded rather than treated as success.

## 4. Legacy administrative scheduler and scheduled digests (file backend)

PostgreSQL instant alerts instead use the registered-rule/transactional-outbox flow in [postgres-and-worker.md](postgres-and-worker.md); do not submit the following legacy instant payload there. Daily/weekly requests below also work in PostgreSQL mode with a shared database lease ledger.

The UI's **Delivery & webhooks → Export worker configuration** flow asks for confirmation before downloading recipient/destination information. It contains no provider access tokens or server secrets, and downloading it does not activate a scheduler.

For separately managed legacy watches or scheduled daily/weekly recaps, a trusted private scheduler supplies its reviewed `config` to:

```http
POST /api/notifications/dispatch
Authorization: Bearer <EAST_SOUND_NOTIFICATION_TOKEN>
Content-Type: application/json

{"action":"instant","config":{...your-exported-configuration...}}
```

Supported actions:

- `instant`: derive events only from the trusted capture store, not from event data in the request. Default lookback is 24 hours; optional ISO `since` must be within those 24 hours. The worker honours activation times and channel consent. Call frequently (for example once per minute).
- `daily`: after the configured EAT hour, one recap of the previous completed EAT day.
- `weekly`: on the configured EAT weekday after its hour, the previous seven completed EAT days and an adjacent prior-period comparison.
- Authorized `force: true` may generate a digest outside its schedule, but **cannot bypass consent** or provider/global-enable checks. Disabling a schedule and making an explicit forced request are separate decisions.

This **legacy scheduler service** is not provisioned. Its explicit configurations are separate from authenticated account preferences; never treat a browser export as a global server account or expose the integration token. Account instant alerts already use automatic queueing and the durable worker; do not also replay those alerts through this legacy path. Daily/weekly recaps still need an operator scheduler and a reviewed recipient/consent configuration.

### Attempts, retries and receipts

- One authorized worker request per second per Node process; maximum 25 claimed jobs per call, sent in batches of five. Repeat scheduled calls to drain excess jobs.
- Attempts are claimed before network I/O, with a 120-second lease. Completion is fenced by attempt number; an expired lease's previous owner cannot overwrite a later attempt.
- HTTP 429/5xx and transient network errors are retryable. Backoff is 60 then 120 seconds, with a maximum of **three total attempts**. Permanent failures remain failed; the third transient failure also becomes failed.
- Accepted IDs are retained for 30 days. Instant IDs are keyed to subscription/event/trigger/channel (and destination for webhooks); digests use kind, period and a recipient hash.
- The **file-backed attempt ledger** stores only IDs/channel/status/count/timestamps/bounded codes—not phone numbers, email addresses, destinations, messages, signing secrets or provider message IDs. The optional PostgreSQL trigger outbox **does** persist private destinations/payload inputs and accepted provider IDs; restrict and encrypt database/backup access and define retention accordingly.
- File-backed atomic mutation is **single-process only**, not distributed exactly-once. Provider timeout/crash ambiguity can cause a repeated send; not every provider honours an idempotency header. Retention is finite. Use a durable transactional queue, provider-supported deduplication, delivery callbacks and reconciliation for production.

Responses include `accepted`, `retry`, `failed`, `skipped`, `attempted`, `candidateJobs`. **Accepted means the provider accepted the HTTP request, not delivered/read.** No delivery receipts are fabricated. Worker failures return a store/integration error without resetting files or assuming success.

## 5. Verify signed webhook requests

The JSON adapter sends `airplay.first`, `airplay.milestone` or `airplay.prime` data. Discord sends `content` with mentions disabled. Telegram relay sends `text` with web-page preview disabled. The relay must apply its own chat/bot credentials.

Headers:

```text
X-East-Sound-Timestamp: <Unix seconds>
X-East-Sound-Signature: v1=<hex HMAC-SHA256>
Idempotency-Key: <stable event/destination identity>
```

Compute the HMAC over the **exact raw UTF-8 body**, prefixed by `timestamp + "."`. Reject missing/malformed signatures, timestamps outside ±300 seconds and previously consumed idempotency keys. The shared `verifyWebhookSignature` helper uses timing-safe comparison; timestamp validation alone is not durable replay prevention.

Outbound protection:

- Public HTTPS only, default/443 port, no user credentials or URL fragments, and exact server-side destination allowlisting.
- Resolve DNS once, reject the whole answer if any address is private/reserved, and pin the connection to an approved address to resist rebinding.
- No redirects; total network deadline of eight seconds including DNS; response bounded to 64 KiB; request bounded to 2 MiB.
- No third-party request is made by configuration editing, template preview, simulated handset playback, PDF export or the public capture feed.

## Static hosting and production checklist

A static build contains public catalogue metadata only and marks provider readiness disabled. It cannot run ingestion, master storage/tag reservation, dispatch or scheduling. Browser-local setup is not a substitute for those APIs.

Before public production, complete mailbox verification/recovery/MFA or a real identity provider; provision and back up durable storage; configure provider callbacks, edge abuse controls and monitoring; license stations/masters/evidence; verify legal signer identity, official registries and applicable tariffs; and review retention/security/legal obligations. Server-side account/session/RBAC enforcement is implemented, but repository tests do not certify those external and operational requirements. Indicative allocations and account-bound reviews are not official UPRS or BMAT certification.
