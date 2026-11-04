# Deploying East Sound Technologies

There are three pieces, each with its own home:

| Piece | Folder | Runs on |
|---|---|---|
| Website + dashboards | repo root | **Vercel** |
| Database, auth, evidence storage | `supabase/` | **Supabase** |
| Stream-ingest worker | `workers/ingest/` | **Any always-on server** (VPS, Railway, Fly.io) — not Vercel |

---

## 1. Push to GitHub

1. On github.com, create a **new private repository** (e.g. `east-sound-technologies`). Don't add a README or .gitignore — this project has them.
2. In this folder:

   ```bash
   git remote add origin https://github.com/<your-account>/east-sound-technologies.git
   git push -u origin main
   ```

GitHub Actions (`.github/workflows/ci.yml`) then runs on every push: website type-check and build, the ingest accuracy test, and the worker Docker build. A red ✗ on a commit means something broke.

## 2. Deploy the website to Vercel

You can do this before Supabase exists — it runs in **demo mode** with sample data.

1. vercel.com → **Add New… → Project** → import the GitHub repo.
2. Framework is detected as **Next.js**; leave the build settings as they are.
3. **Deploy.** Every push to `main` now redeploys; pull requests get preview links.

The `.vercelignore` keeps the worker and database files out of the website deployment.

## 3. Turn on Supabase (live mode)

1. supabase.com → **New project**. Pick the region closest to Uganda (e.g. Frankfurt or South Africa if offered).
2. **SQL Editor → New query**, then paste the whole of **`supabase/setup.sql`** and press **Run**. It applies all three migrations in one transaction — if anything fails, nothing is left half-built and you can simply run it again.

   Prefer to see the steps separately? Run these three files in this order: `0001_rbac_schema.sql` → `0002_stream_ingest.sql` → `0003_dashboards_live.sql`. They are what `setup.sql` is generated from (`npm run setup:sql`), and CI applies the generated file to a blank database on every push so the two can't drift.
3. **Authentication → URL Configuration**:
   - Site URL: `https://<your-vercel-domain>`
   - Redirect URLs: `https://<your-vercel-domain>/auth/callback` and `https://<your-vercel-domain>/auth/reset`
4. **Project Settings → API** — copy the Project URL and the `anon` public key.
5. In Vercel → Project → **Settings → Environment Variables**, add:

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon public key |
   | `NEXT_PUBLIC_SITE_URL` | `https://<your-vercel-domain>` |

6. **Redeploy** (Deployments → ⋯ → Redeploy). The demo banner disappears and sign-up is real.
7. Open **`/setup`** on the deployment. It probes the project with the anon key and tells you, check by check, what is still missing — no more guessing whether the env vars took effect. The same report is machine-readable at **`/api/health`** (200 when every blocking check passes, 503 otherwise), which is what an uptime monitor should watch.

**CMO accounts start unapproved.** To activate one: Supabase → Table Editor → `profiles` → set `approved = true`.

**Link accounts to what they own** (Table Editor): a broadcaster sees a station once `stations.broadcaster_org_id` is their organisation; a venue sees its venue via `venues.venue_org_id`; an independent artist sees recordings where `recordings.artist_profile_id` is their profile.

**Want working dashboards straight away on a staging project?** Sign up the five demo accounts listed at the top of `supabase/seed/demo_data.sql`, approve the CMO one, then run that file. It loads realistic sample data (and a rival label/station/venue to show isolation).

> Never put the **service-role** key in Vercel. It bypasses all row-level security and belongs only on the ingest server.

## 4. Run the stream-ingest worker

The worker must run on something **always-on** — it holds open the station streams and fingerprints them in real time. Vercel cannot host it.

Both hosts mount volumes as **root**, so the image starts with a tiny entrypoint that takes ownership of the data directory and then drops to the unprivileged `ingest` user. You do not have to `chown` anything by hand.

### Option A — Railway (fewest clicks)

1. railway.app → **New Project → Deploy from GitHub repo** → pick this repo.
2. Set **Root Directory** to `workers/ingest`. `railway.json` supplies the Dockerfile and the start command.
3. **Variables:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (Supabase → Project Settings → API). Add `EST_INDEX_PATH=/data/fingerprints.db` and `EST_OUT_DIR=/data/out`.
4. Attach a **Volume** mounted at `/data` so the fingerprint index and any dry-run clips survive restarts.
5. Run the pre-flight check before letting it loose on the streams:

   ```bash
   railway run python -m eastsound_ingest --stations stations.csv doctor
   ```

   Every line must be `✓` before `run` starts. `!` lines are non-blocking hints (an empty fingerprint index, for example). A `✗ ffmpeg not on PATH` means the image was not built from this Dockerfile.

### Option B — Fly.io

```bash
cd workers/ingest
fly launch --copy-config --name eastsound-ingest --region jnb   # jnb = Johannesburg
fly secrets set SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=...
fly volumes create est_data --size 3
fly deploy
fly logs
```

Then run the pre-flight check inside the deployed machine:

```bash
fly ssh console -C "python -m eastsound_ingest --stations stations.csv doctor"
```

### Option C — any VPS / your own server

```bash
git clone https://github.com/<your-account>/east-sound-technologies.git
cd east-sound-technologies/workers/ingest
cp .env.example .env
#   fill in SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (Project Settings → API → service_role)
docker compose run --rm ingest python -m eastsound_ingest --stations stations.csv doctor
docker compose run --rm -v ~/masters:/masters ingest python -m eastsound_ingest enroll-dir /masters
docker compose up -d --build
docker compose logs -f          # watch detections arrive
```

`enroll-dir` prints one line per master and the final count. It is safe to re-run: the same recording is skipped instead of duplicated.

Edit `stations.csv` to add or pause stations, then restart the worker. Leave the two Supabase variables empty for a **dry run**: detections are written to the `ingest-data` volume instead of the database.

Confirm it end-to-end: `/setup` should flip **Ingest worker reporting** to green within a few minutes of the first detection, and the broadcaster playout timeline starts filling.

## 5. Turn on WhatsApp and email alerts

Clients should not have to sit in the dashboard waiting for a spin. The database already knows who should hear about what (`alert_outbox`, migration 0005); the website drains that queue at `/api/cron/alerts`.

1. **Variables in Vercel** (Settings → Environment Variables, *server* scope):

   | Variable | What it is |
   | --- | --- |
   | `CRON_SECRET` | Any long random string. Without it the endpoint refuses to run. |
   | `SUPABASE_SERVICE_ROLE_KEY` | Used only by this route to read the queue and look up emails. |
   | `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_TOKEN` | Meta → WhatsApp Cloud API. Token must be a *permanent* system-user token. |
   | `RESEND_API_KEY`, `ALERT_FROM_EMAIL` | Email fallback, e.g. `alerts@eastsound.ug` (the domain must be verified in Resend). |

   With no provider configured the route enqueues nothing and sends nothing — a half-set-up deployment stays silent instead of misbehaving.

2. **Schedule it.** Vercel Hobby only allows one cron per day, so `vercel.json` runs the sweep at 06:00 UTC. For WhatsApp-speed alerts, add an Actions secret pair and the included workflow does it every 15 minutes:

   - `CRON_URL` = `https://<your-domain>/api/cron/alerts`
   - `CRON_SECRET` = the same string as in Vercel

   `.github/workflows/alerts.yml` skips itself quietly while those secrets are absent.

3. **Prove it** before announcing anything:

   ```bash
   curl -fsS "https://<your-domain>/api/cron/alerts?limit=1" -H "Authorization: Bearer $CRON_SECRET"
   ```

   A useful answer looks like `{"ok":true,"channels":["whatsapp"],"enqueued":1,"picked":1,"sent":1,...}`. `channels: []` means the provider variables are missing; `"skipped"` counts people who have not saved a phone number or email yet.

4. **What actually gets sent.** `enqueue_alerts` writes one row per person per event — first spin on a new station, an ownership dispute on either side, a new royalty statement — and honours each person's switches in *Settings → Alerts*. `?weekly=1` also enqueues chart movement. Rows are unique per `(profile_id, dedupe_key)`, so running the sweep every 15 minutes can never send the same news twice.

## Checklist before real clients

- [ ] Native-speaker review of Luganda and Kiswahili strings (`lib/i18n.tsx`)
- [ ] Legal review: monitoring public streams and storing 10-second clips; station partnership terms
- [ ] Real-audio test: record 1–2 hours of a station, enroll real masters, check misses / wrong matches
- [ ] Custom domain in Vercel (Settings → Domains), then update the Supabase URLs in step 3
- [ ] WhatsApp templates approved by Meta if you send outside the 24-hour window; test with a real handset first
- [ ] Native-speaker review of the alert wording (`lib/alerts/compose.ts`) alongside the UI strings
