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
2. **SQL Editor** → run, in order:
   - `supabase/migrations/0001_rbac_schema.sql`
   - `supabase/migrations/0002_stream_ingest.sql`
   - `supabase/migrations/0003_dashboards_live.sql`
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

**CMO accounts start unapproved.** To activate one: Supabase → Table Editor → `profiles` → set `approved = true`.

**Link accounts to what they own** (Table Editor): a broadcaster sees a station once `stations.broadcaster_org_id` is their organisation; a venue sees its venue via `venues.venue_org_id`; an independent artist sees recordings where `recordings.artist_profile_id` is their profile.

**Want working dashboards straight away on a staging project?** Sign up the five demo accounts listed at the top of `supabase/seed/demo_data.sql`, approve the CMO one, then run that file. It loads realistic sample data (and a rival label/station/venue to show isolation).

> Never put the **service-role** key in Vercel. It bypasses all row-level security and belongs only on the ingest server.

## 4. Run the stream-ingest worker

On a Linux server with Docker installed:

```bash
git clone https://github.com/<your-account>/east-sound-technologies.git
cd east-sound-technologies/workers/ingest
cp .env.example .env
#   fill in SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (Project Settings → API → service_role)
```

Enroll the masters, then start monitoring:

```bash
docker compose run --rm -v ~/masters:/masters ingest python -m eastsound_ingest enroll-dir /masters
docker compose up -d --build
docker compose logs -f          # watch detections arrive
```

Edit `stations.csv` to add or pause stations, then `docker compose restart`.

Leave the two Supabase variables empty for a **dry run**: detections are written to the `ingest-data` volume instead of the database.

## Checklist before real clients

- [ ] Native-speaker review of Luganda and Kiswahili strings (`lib/i18n.tsx`)
- [ ] Legal review: monitoring public streams and storing 10-second clips; station partnership terms
- [ ] Real-audio test: record 1–2 hours of a station, enroll real masters, check misses / wrong matches
- [ ] Custom domain in Vercel (Settings → Domains), then update the Supabase URLs in step 3
