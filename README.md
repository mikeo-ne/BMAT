# East Sound Technologies

Music copyright & airplay tracking SaaS — a 7H Music Group Ltd product.
Next.js 15 (App Router) · Tailwind CSS · Supabase · Web Audio API.

**Deploying?** See [DEPLOY.md](DEPLOY.md) for GitHub → Vercel → Supabase → ingest server, step by step. Database setup is one paste: `supabase/setup.sql` (`npm run setup:sql` regenerates it). Afterwards, `npm run health <url>` tells you what is still missing.

## Run it

```bash
npm install
cp .env.example .env.local   # leave empty for DEMO MODE
npm run dev                  # http://localhost:3000
```

**Demo mode** (no Supabase keys): any email + 6-character password signs you into the role you pick, with sample data. Changes you make last for the session. Nothing is sent anywhere.

**Live mode** (Supabase connected): every dashboard reads and writes the real database, limited by role at the database level.

**Setting up live mode**: create a Supabase project, run the three files in `supabase/migrations/` in order in the SQL editor, add the URL + anon key to `.env.local`, and add `<site>/auth/callback` and `<site>/auth/reset` to Auth → URL Configuration → Redirect URLs.

## Role isolation — three layers

| Layer | Where | What it stops |
|---|---|---|
| 1. Middleware | `middleware.ts` | Any request to `/dashboard/<x>` where `x` ≠ the caller's role is redirected to their own dashboard before HTML is served. Role is read from the verified Supabase user's `profiles` row. |
| 2. RoleGuard | `components/dashboard/RoleGuard.tsx` | The dashboard tree (and therefore its data module) renders only when `session.role` matches the page. Each route imports only its own `components/dashboards/<role>` and `lib/data/<role>.ts`, so other roles' code isn't even in the bundle. |
| 3. Postgres RLS | `supabase/migrations/0001_rbac_schema.sql` | Every table enforces role + organisation ownership, so a hand-crafted API call with a valid token still can't read another role's rows. |

Additional rules:
- Role comes from sign-up metadata, is validated by a DB trigger, and **cannot be changed by the user** afterwards (`lock_profile_fields` trigger).
- Signing in with a different role than the one registered is refused, not silently switched.
- **CMO accounts start unapproved** (they have universal read access) and land on `/pending` until East Sound staff set `approved = true`.
- Password recovery returns the same message whether or not the email exists (no account enumeration).

## Routes

| Route | Purpose |
|---|---|
| `/` | Landing: sticky nav, live badge, EN/LG/SW, Solutions & Use Cases dropdowns, hero visualizer, playout ticker, Top 10 with regional filters + 10s evidence player |
| `/blog`, `/blog/[slug]` | Live metric feed, category pills, search |
| `/dashboard` | Routes to the caller's own dashboard |
| `/dashboard/cmo` | Registry, split calculator, Top 100, regional heatmap, dispute engine, unmatched queue |
| `/dashboard/label` | Roster, batch fingerprint dropzone, ISRC/UPC tracker, revenue, WhatsApp alerts |
| `/dashboard/artist` | Discography, spin velocity, split summary, WhatsApp alerts |
| `/dashboard/broadcaster` | Playout timeline, UPRS cue sheet PDF/XLSX export, ad control auditor |
| `/dashboard/venue` | UPRS compliance badge, listener nodes, DJ set logs |
| `/auth/callback`, `/auth/reset`, `/pending` | Email confirmation, password recovery, CMO approval wait |
| `/setup`, `/api/health` | Live readiness console: which env var, migration or worker is still missing. JSON for uptime monitors |

## Defensive standards applied

- `"use client"` on every interactive file; server components only for static shells.
- `window` / `localStorage` / `document` touched only inside `useEffect` or event handlers (`lib/safe.ts → safeStorage`, `usePersistentState`).
- `safeArray()` / `(x || []).map` on every list; `DataTable` renders an empty state for null rows.
- `AudioContext` created only in click/drop handlers (`lib/audio.ts → getAudioContext`), resumed if suspended — works on iOS Safari.
- Route-level `error.tsx` boundaries so a runtime error never white-screens.
- Seeded PRNG for demo data → identical server/client render, no hydration mismatch.
- Verified: production build clean; headless-Chrome run across all 5 roles, cross-role URL jumps, PDF/XLSX export, audio playback and mobile width with **zero console errors**.

## Tests

| Command | What it proves |
|---|---|
| `npm run build` | The site and all dashboards compile |
| `python3 supabase/tests/test_rls.py` | On real PostgreSQL: every table × every role sees only its own rows; 20 forbidden writes are refused; evidence clips follow play visibility |
| `node supabase/tests/data-layer.test.mjs` | The app's real data code, run against PostgREST (Supabase's API server) as each role: dashboards load the right data, saves persist, cross-role calls return nothing |
| `cd workers/ingest && python -m tests.test_broadcast` | Song recognition on a degraded simulated broadcast |

All four run in GitHub Actions on every push.

## Still to do before launch

- **Evidence clips on the public chart**: kept private by design; rights holders hear them in their dashboards.
- **WhatsApp sending**: settings are saved per account; actual delivery needs a WhatsApp Business API sender.
- **Real-audio test**: record 1–2 hours of a real station with real masters enrolled.
- **Translations**: Luganda and Kiswahili strings in `lib/i18n.tsx` are drafts — have a native speaker review them.
- **Legal review**: monitoring third-party streams and storing 10-second excerpts.

## Stream ingest worker

`workers/ingest/` monitors station streams, recognises songs from the enrolled catalogue and writes detections + 10-second evidence clips into Supabase. Run migration `0002_stream_ingest.sql` after `0001`. See `workers/ingest/README.md`.
