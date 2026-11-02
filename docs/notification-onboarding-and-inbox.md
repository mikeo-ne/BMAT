# Notification onboarding and private webhook inbox

This follow-up adds **Alerts → Integration setup** (`/dashboard/alerts/setup`) and an owner-bound signed webhook inbox. It does not create a Meta account, register/migrate a phone number, verify an email domain, purchase a domain, upgrade a provider plan or enable global sending.

## 1. WhatsApp Business when you currently use the phone app

The existing outbound adapter uses **Meta WhatsApp Cloud API**, not a phone-app login or personal WhatsApp password.

1. Start the provider's Cloud API/business onboarding and its test-sender flow. Keep the current phone-app account/number unchanged while confirming eligibility.
2. Before production, choose a registered API sender or a supported coexistence/migration flow after reviewing consequences and costs with Meta. Do not delete the existing phone account or assume message history transfers.
3. Approve a useful alert template with **one body text parameter** (`{{1}}`) for the full alert. Include appropriate fixed context; an all-variable template is not an approval guarantee.
4. Save `WHATSAPP_ACCESS_TOKEN`, the numeric **Meta sender ID** in `WHATSAPP_PHONE_NUMBER_ID` (not a +256 recipient number), supported `WHATSAPP_GRAPH_VERSION`, approved `WHATSAPP_TEMPLATE_NAME`, and its exact `WHATSAPP_TEMPLATE_LANGUAGE` in secure Production-only settings.
5. Only genuinely opted-in recipients and real authorised captures may cause live alerts. The phone simulator remains local and never sends a provider message.

Meta account/business ownership, sender/template approval, access-token privileges, billing and provider-side testing require the operator's own provider account. No such approval is inferred from an environment variable being present.

## 2. Email when you currently have Gmail/Outlook

Keep the existing personal inbox for **receiving** messages. The deployed sender uses **Resend**, not the mailbox password.

- Create the provider account and a sending API key. Store it as `RESEND_API_KEY`, Sensitive and Production-only; never paste it into chat or an application form.
- Resend's `onboarding@resend.dev` sender is restricted testing: it can send only to the email associated with the Resend account. It is not a production sender for other users. [Provider documentation](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain).
- To send to other recipients, verify a domain you control, complete the required DNS verification and set a bare sender address on that domain as `EAST_SOUND_EMAIL_FROM`. A Gmail domain or shared `vercel.app` address is not a domain you can verify as your own.
- Review any domain/provider costs before purchasing or upgrading. The setup page warns when a restricted test sender is configured; `configured` does not mean provider approval, delivered/read status or mailbox ownership verification.

Do not flip the global live/worker switches merely to test a personal inbox. Provider testing should use your own approved tools/recipients or a dedicated staging setup, without fabricated production captures.

## 3. What the new webhook inbox does

A webhook is machine-to-machine data delivery, not another phone/email inbox. This receiver accepts the documented **signed East Sound JSON envelope** and stores a minimized private integration receipt.

It is **not**:

- a Meta `hub.challenge` / delivery-status callback, a Resend/Svix callback, a capture daemon or a licensed matcher;
- proof that airplay, rights, royalties, identity or provider delivery/read receipts are verified;
- an automatic forwarder, notification subscription or bridge into `airplay_logs` / `notification_outbox`.

There is no self-forwarding loop: received requests never create captures, catalogue masters, royalty allocations, outbound queue jobs or another HTTP request.

### Storage and migration

Use the existing PostgreSQL backend and encryption key. **Explicitly apply additive migration `003_webhook_receivers.sql` before receiver creation** with the reviewed migration CLI. Back up first and use staging before production. The migration creates only the dedicated receiver/receipt tables and indexes; it does not reset accounts, captures, masters, agreements or outbox history. Existing migrations 001/002 are unchanged.

No DDL runs from a page render, webhook request or ordinary application build. If PostgreSQL, recorded migration 003 or the tables are unavailable, receiver operations fail closed with an explicit unavailable/migration state. There is no ephemeral filesystem success or replacement empty inbox. The setup guidance still works on a file-backed Node preview, but receiver creation does not.

### Management authority and one-time keys

- `GET /api/integrations/webhooks` returns only the signed-in artist's receivers, at most 20 latest minimized receipts per receiver, redacted readiness and safe origin/storage status.
- `POST /api/integrations/webhooks` accepts `create`, `rotate`, `enable`, `disable` and `test`. It requires a current non-mock **Artist / Label Manager** session plus same-origin/CSRF checks. Other artists cannot operate on an ID they do not own; broadcaster/CMO/guest roles cannot manage an inbox.
- The server generates an independent 32-byte signing key for each receiver. It returns the plaintext only from an authorised create/rotate operation, with `no-store`; storage uses the existing AES-GCM vault key. Reading/listing never reveals the key or ciphertext. Do not rotate the application encryption key to recover a lost signing key—rotate that receiver instead.
- The UI masks the one-time key, offers explicit reveal/copy, does not cache it in localStorage/IndexedDB and clears it on auth changes. A late response for an old identity cannot display a key after an account swap.
- Creation is transactionally capped at five receivers/account (including disabled ones), with persistent per-account creation/change/test limits. Rotation updates the generation and invalidates the previous signing key; disabling rejects new requests without deleting history. Neither action changes a notification subscription or global provider setting.

### Public receiver protocol

`POST /api/webhooks/airplay/:receiverId` uses HMAC machine authentication, **not browser cookies or CSRF**. No cross-origin browser CORS permission is added. The receiver ID/URL alone is not authorization.

Send uncompressed UTF-8 JSON, at most **32 KiB**, with:

```text
Content-Type: application/json
X-East-Sound-Timestamp: <Unix seconds>
X-East-Sound-Signature: v1=<hex HMAC-SHA256(secret, timestamp + "." + exact UTF-8 JSON body)>
```

The timestamp must be within five minutes of server time. Raw bytes are bounded and UTF-8 is validated before parsing; verification does not reserialize the input. The current active receiver/account/key is checked again while holding the receiver row lock, so an overlapping disable/rotation cannot authorize insertion with stale state.

The body is the existing `notificationWebhookPayload` contract (`source: "east-sound"`, `mode: "captured"`, `type: "airplay.first" | "airplay.prime" | "airplay.milestone" | "airplay.custom_threshold"`, signed opaque `id`, ISO `occurred_at`, recording/station fields and message), or an explicit configuration-test envelope:

```json
{
  "id": "cfg_unique_event_id",
  "type": "east-sound.configuration-test",
  "source": "east-sound",
  "mode": "configuration-test",
  "occurred_at": "2026-11-02T10:00:00.000Z",
  "message": "Configuration only, not recorded airplay."
}
```

Do not copy that fixed ID/timestamp into every real request; generate a fresh test ID and current occurrence time. Alerts are stored as **signed external claims**, not verified capture records. Simulator events are not accepted as alerts. Unknown fields (including separately supplied contact/token fields), request headers and raw request bodies are not retained; allowed message/title fields may still contain private content and need access/retention controls. Display fields are bounded, with truncation explicitly indicated. A SHA-256 of the exact body is retained for integrity/conflict checks.

### Durable deduplication and safe responses

Deduplication uses the event `id` **inside the signed body**, scoped to the tenant and receiver, and a unique SQL key. The unsigned `Idempotency-Key` header cannot change it.

- Fresh accepted receipt: `202`, `duplicate: false`, `verifiedAirplay: false`.
- Same signed ID and identical raw-body checksum: `200` with the same receipt ID, including a correctly re-signed later retry. No second receipt/audit entry is inserted.
- Same ID with different body: `409`; nothing is overwritten.
- Missing/wrong/stale signature: `403`; disabled, unknown or inactive-owner receiver: `404`.
- Malformed JSON/envelope, invalid UTF-8, wrong media type or oversized body: `400`/`422`, `415` or `413` as appropriate.
- Verified ingress is persistently rate-limited per receiver (`120 / 5 minutes`); no queue/provider action occurs on rejection.

Receipt insertion and a machine-origin audit entry (`actor_id: NULL`, not a fabricated user action) commit in one transaction. An audit/database failure rolls both back, leaving the event retryable. SQL constraints/row locks serialize concurrent duplicates. There is no process-local-only replay cache.

Receipt rows are retained, and the UI reads only the latest 20. Define backup, privacy, retention/purge and data-subject procedures before high-volume use. If purging payloads, preserve reviewed deduplication tombstones; deleting deduplication rows permits later re-ingestion. No automatic purge is supplied and disabling is not permanent erasure.

### Local verifier test versus actual external delivery

The owner button **Run local verifier test** constructs a clearly marked configuration envelope and calls the same signature/storage service **in-process**. It records a configuration-test receipt, makes no external HTTP request and sends no WhatsApp/email message. It is useful before provider onboarding but does not prove public HTTPS routing, a remote sender, capture licensing or delivery/read status.

The separate integration browser suite sends actual signed HTTP requests to an isolated loopback PostgreSQL app. This is not a production-network or external-provider test. Configure/review the intended downstream consumer before advertising a webhook integration as live.

## 4. Outgoing activation remains separate

Creating a receiver does not allowlist or subscribe it. For outgoing webhook alerts, the operator must approve the exact public HTTPS URL in `EAST_SOUND_WEBHOOK_ALLOWLIST`; the owner must save the matching signing secret and opted-in subscription through Delivery & webhooks. Retain DNS/IP pinning, redirect rejection and encrypted write-only secrets.

WhatsApp/email require their approved provider credentials and genuine recipient consent. Only then deliberately enable `EAST_SOUND_LIVE_NOTIFICATIONS=true` and `EAST_SOUND_WORKER_ENABLED=1`, review pending backlog, and validate with authorised recipients. The existing daily authenticated cron is a retry safety net, not a prompt retry guarantee or daily/weekly digest scheduler. No paid plan is upgraded automatically.

## 5. Verification commands

Run the usual typecheck, lint, unit/API, disposable PostgreSQL and serial Node/static builds. `npm run test:browser` retains the isolated file-backed fullstack suite. For the new real-browser inbox suite, explicitly run a separate local app backed by a **disposable loopback PostgreSQL database** with migration 003 and a matching ignored `.data/qa` directory, then set:

```text
EAST_SOUND_INTEGRATION_TEST_URL=http://127.0.0.1:3012
EAST_SOUND_INTEGRATION_DATA_DIR=/absolute/path/to/checkout/.data/qa/receiver-browser
EAST_SOUND_INTEGRATION_DATABASE_URL=<private connection to the disposable LOOPBACK test database>
npm run test:integrations
```

The integration config rejects non-loopback app/database hosts, missing test-database configuration and non-QA paths. Never use production credentials or aim mutating fixture tests at production. Tests create only isolated QA accounts/receipts, assert no capture/outbox/master side effects, and send no real provider messages.
