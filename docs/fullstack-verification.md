# East Sound fullstack verification

Verified locally on **2 November 2026 (Africa/Nairobi)** with Node **22.22.3**, Next.js **16.4.3** and React **19.2.8**. These results describe this working branch, not a deployed release or a production security certification.

| Check | Result |
| --- | --- |
| Clean lockfile installation (`npm ci`) | Passed |
| Type generation / TypeScript | Passed |
| ESLint | Passed |
| Unit/component/API suites | **826 passed across 61 files** |
| Isolated real PostgreSQL integration suite | **35 passed** |
| Optimized Node production build | Passed |
| `/BMAT` public-only static export | Passed |
| Browser workflows against the production Node build | **12 passed** |
| Read-only public/reference browser checks | **19 passed** |
| Static export browser scenarios | **7 passed**, no browser errors, API calls or external requests |
| Production dependency audit (`npm audit --omit=dev`) | **0 vulnerabilities** |
| Whitespace/diff check | Passed |

## What the browser checks exercise

- Actual WAV and MP3 decoding and nonzero PCM waveform/spectral features; the 80 MiB limit and non-audio rejection.
- Separate contributor accounts, immutable split-sheet approval, authenticated delivery, private byte-range playback and withdrawal.
- Server-enforced public/artist/broadcaster/CMO authorization, station assignment checks, role-forgery rejection and cross-account data isolation.
- HttpOnly session persistence, account swaps, IndexedDB eviction, cross-tab logout and blocked localStorage.
- Persistent alert/source settings, new-capture outbox enqueueing, local WhatsApp/PDF simulation and retained named Ugandan examples.
- Audible station/evidence playback, CMO review/audit persistence, real navigation and 320 px / 768 px layouts.
- Public-only static content and private-page sign-in gates on the read-only runtime. The read-only runtime created no datastore.

Captures and privileged role fixtures were confined to an ignored, isolated QA store. PostgreSQL was temporary and local. No production database/account migration, external message, licensed station capture or deployment was performed. Newly created master/metadata files were also checked for **0600** permissions and private directories for **0700** on Linux.

## Dependency-audit boundary

Next.js and its ESLint configuration were updated together to 16.4.3; affected production transitive dependencies were refreshed. The production dependency set audits clean.

The **complete development tree still reports 26 findings (18 moderate, 8 high)**, including the historical Prisma 6 tooling and other test/build dependencies. This is not a claim that the complete dependency tree is clean. Automated `npm audit fix` encountered an npm peer-resolution error; no forced major upgrade or unreviewed dependency override was applied. A subsequent clean `npm ci` and all verification above passed. Review/remediate that toolchain separately, particularly before moving the historical Prisma draft to Prisma 7; do not run exposed development/test servers as the production service.

## Before a real launch

See [fullstack operations](fullstack-operations.md) and [PostgreSQL/worker setup](postgres-and-worker.md). Provision real identities, durable private master storage/database and encrypted-secret backups; configure licensed recognition/evidence, approved messaging providers and delivery callbacks; and complete identity hardening, abuse controls, observability, retention and operational/legal review. Mock OAuth, generated sample audio, local ISRC-format tags, illustrative allocations and simulated messages are not production identity, recognition, rights certification, official registration, settlement or delivery receipts.

The 80 MiB master workflow is supported on the persistent Node host. Vercel master mutations remain disabled pending a reviewed object-storage/request-size adapter. Static export is a public showcase, not the authenticated application.

Detailed local logs and machine-readable results are kept under the ignored `.data/qa/fullstack-verification/` directory, rather than committed as generated artifacts. Reproduction commands and isolated-browser safeguards are in the operations guide.
