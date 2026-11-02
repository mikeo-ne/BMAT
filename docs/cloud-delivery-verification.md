# Cloud delivery implementation verification

Verified locally on **2 November 2026**, branch `arena/a1941d35-bmat`, based on production commit `666f8f5f2ac4a0cc80b087c544f1524464e07aa9`. This is a follow-up to the historical fullstack verification report, not a claim that external services have been activated.

| Check                              | Result                                                  |
| ---------------------------------- | ------------------------------------------------------- |
| TypeScript / generated route types | Passed                                                  |
| ESLint                             | Passed                                                  |
| Unit/component/API suites          | **876 passed across 65 files**                          |
| Disposable real PostgreSQL suites  | **51 passed across 2 files**                            |
| Real Chromium fullstack workflows  | **12 passed** against an isolated production Node build |
| Optimized Node build               | Passed                                                  |
| Public-only static export          | Passed                                                  |
| Production dependency audit        | **0 vulnerabilities**                                   |

The additional checks exercise actual SDK callback HMAC/token generation, owner/CSRF/mock-role rejection, streamed source hashing including exactly 80 MiB, invalid containers and object metadata, private-store/public-access rejection, quoted ETags and byte ranges, concurrent finalization, audit rollback, stale verification leases, cancelled/revoked sign-off, safe orphan cleanup and retained soft-deleted masters, direct client transport/identity changes, and disabled/unconfigured notification execution. The PostgreSQL tests use real transactions, constraints and row locks; Blob/provider calls are mocked. No production account, capture, delivery or external message was created by these suites.

The browser suite validates the retained local workflow: real WAV/MP3 decoding and signatures, independent account sign-off, authenticated private playback/withdrawal, role/station scopes, settings/outbox/simulators, blocked storage, logout/account-change cache isolation, and 320/768px layouts. It does **not** validate a real private Blob multipart transfer. The sandbox browser needed multiprocess launch settings: the initial serverless Chromium default `--single-process` closed unrelated browser contexts. Removing that flag and disabled-web-security flags, then using a fresh isolated QA store, passed all 12 tests without changing application assertions.

The Blob SDK is pinned to `@vercel/blob@2.8.2`. Its CLI configuration dependency pins an advisory-affected Zod release; a narrowly scoped override to compatible Zod `4.6.6` keeps the runtime audit clean. The separately documented development/legacy Prisma tooling findings are not silently treated as resolved.

## Production preflight and remaining activation

An authorised, non-promoting preflight in the existing Vercel production environment confirmed:

- No configured `BLOB_READ_WRITE_TOKEN`; no private store could be verified.
- WhatsApp, email and allowlisted webhook provider configuration are absent.
- Live sending, automatic worker activation and scheduler authentication are not configured/enabled.
- **Zero master bytes uploaded, messages sent or accounts created.** No credential values were printed or retrieved through the connector.

The operator-only preflight intentionally stops before application build/alias promotion; its expected failed-build state does not replace the healthy public application. The implementation requires a PRIVATE store, production-only credentials, an independently generated scheduler secret and deliberate provider/worker/live activation. No billing plan was upgraded, public store adopted, production migration performed or fake success sent.

See [the rollout/security guide](cloud-masters-and-live-delivery.md) for configuration, API guarantees, retention and Hobby scheduling limitations. The daily cron is a retry safety net, not a prompt retry SLA; daily/weekly digest delivery remains its separately reviewed scheduler contract. Mailbox/legal verification, abuse/quota controls, provider approval, licensed capture, delivery callbacks, backups and independent security review remain deployment responsibilities.

Ignored local logs and manifests are retained under `.data/qa/cloud-verification/`; generated browsers, large fixtures, secrets and runtime data are not part of the Git change.
