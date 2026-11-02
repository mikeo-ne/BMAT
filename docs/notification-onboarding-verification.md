# Notification onboarding / receiver verification

Verified on **2 November 2026**, working branch `arena/c2de2f77-bmat`, based on production commit `35a18336f52fc16ca32002bd9532670a8c306533`.

| Check                                               | Result                         |
| --------------------------------------------------- | ------------------------------ |
| TypeScript and generated route types                | Passed                         |
| ESLint                                              | Passed                         |
| Unit/component/API tests                            | **900 passed across 67 files** |
| Disposable real PostgreSQL tests                    | **69 passed across 3 files**   |
| New PostgreSQL-backed integration browser workflows | **4 passed**                   |
| Existing file-backed fullstack browser workflows    | **12 passed**                  |
| Optimized Node build / public-only static export    | Both passed, serially          |
| Production dependency audit                         | **0 vulnerabilities**          |

## What was exercised

- Real migration 003, tenant/owner foreign keys, encrypted receiver keys, one-time key responses, masked/explicit reveal UI and no key/ciphertext in list/read responses or browser storage.
- Session/CSRF and artist/non-mock management boundaries; cross-account and tenant rejection; disabled-owner/receiver rejection and key rotation.
- HMAC verification over exact bounded UTF-8 JSON with a five-minute timestamp window, invalid/stale/tampered input rejection, simulated-event rejection and signed-ID deduplication independent of unsigned headers.
- Actual SQL constraints/row locks and concurrent duplicate requests producing one receipt/audit; changed-body ID conflicts; fresh re-signed retries a day later remaining duplicates; audit-failure rollback and retry.
- Minimized payloads and bounded, well-formed Unicode/emoji previews (no split surrogates or invalid JSONB null text). Unknown input fields and raw request bodies are not persisted.
- An actual local HTTP signed-ingress browser workflow, private inbox/history, reload without secret recovery, key rotation, separate browser accounts and 320/768px layouts with long labels and keys.
- Explicit configuration-test receipts and assertions of **zero captures, business masters or outgoing jobs**. The owner button is correctly labelled as an in-process verifier/storage test, not external delivery.
- The existing real WAV/MP3/sign-off/private-playback, role/station, outbox/simulation, blocked-storage, cache/logout and responsive workflows passed unchanged.

The browser integration config requires explicit loopback app/database URLs and a matching ignored QA data path. The PostgreSQL and browser tests use separate disposable/local QA stores, not the production database, Blob store, actual phone numbers or email recipients. No external provider message was sent.

## Production boundaries

The additive **003_webhook_receivers.sql** migration must be reviewed and applied explicitly before production receiver creation. It creates receiver/receipt tables and indexes only; migration 001/002 checksums, existing users, captures, masters, agreements and queues are unchanged. A missing/unavailable schema is displayed explicitly and never replaced with a temporary file or empty reset. No migration runs on requests or normal builds.

**No production migration, environment change or deployment was performed for this follow-up.** Existing production private master uploads remain on the prior verified release. Global live sending and notification-worker settings were not enabled, and no provider account, sender, phone migration, domain purchase or paid plan was created.

WhatsApp still requires Meta Cloud API/business onboarding, the appropriate sender/template and genuine recipient opt-in. Email uses Resend: its test sender is restricted to the Resend-account inbox; other recipients require a verified controlled domain. Provider settings present does not mean provider approval or delivered/read status. The signed inbox is not a Meta/Resend delivery-status callback, licensed capture source or automatic forwarding loop.

The inbox retains receipt/deduplication rows; the UI exposes only the latest 20 per owned receiver. Backup, access, retention/purge/tombstone policy, clock/abuse monitoring and high-volume load review remain operator responsibilities. See [the setup/security guide](notification-onboarding-and-inbox.md).

Ignored evidence is retained under `.data/qa/receiver-verification/`. Generated databases, browser runtimes, QA accounts/media, secrets and large fixtures are not part of the Git change.
