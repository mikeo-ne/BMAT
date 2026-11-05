# Going live — one step at a time

Everything the code can do is already done and tested. What is left needs your
accounts: a worker host, master audio, a merge, an SMTP provider and (later)
alert credentials. Do them in this order — each step makes the next one
verifiable.

**Your project** (already created and wired):

| Thing | Value |
| --- | --- |
| Supabase project | `vewkhidaajdrfkedeavs` → `https://vewkhidaajdrfkedeavs.supabase.co` |
| Production site | `https://bmat-rho.vercel.app` |
| Vercel project | `eastsound` (team `mike-1-ne`) |
| GitHub repo / branch | `mikeo-ne/BMAT`, branch `arena/c89d940d-bmat` (PR #22) |

Never paste a key into this chat. Keys go into Railway/Fly/Vercel/GitHub only.

---

## Step 1 · Put the worker on an always-on host (≈10 min)

The worker is the thing that listens to radio stations and records what played.
It cannot run on Vercel.

### 1a. Decide on the key you will use

**Option A — use the existing secret (fastest).** Skip to 1b and copy the
`service_role` / `secret` key from Supabase → **Project Settings → API Keys**.

**Option B — make a fresh one (recommended before real clients).** Supabase →
**Project Settings → API Keys → Create new secret key**, name it
`ingest-worker`, copy the `sb_secret_…` value. Put *that* in Railway and in
Vercel, then disable the old `service_role` key. Your `NEXT_PUBLIC_…anon` key
does not change, so the website keeps working.

> Do not rotate the legacy *JWT secret* — that would invalidate the anon key
> sitting in Vercel and take the site down until you update it.

### 1b. Create the service on Railway

1. <https://railway.app> → **New Project → Deploy from GitHub repo** → pick
   `mikeo-ne/BMAT`.
2. Open the service → **Settings**:
   - **Source → Branch**: `main`
   - **Source → Root Directory**: `workers/ingest`  ← most common mistake
3. **Variables → Raw Editor**, paste (filling in your key):

   ```
   SUPABASE_URL=https://vewkhidaajdrfkedeavs.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=paste-your-key-here
   ```
4. **Volumes → Add volume**, mount path `/app/data`, size 3 GB.
5. Deploy. The build takes ~2 minutes (it installs ffmpeg).

<details>
<summary>Prefer Fly.io? (same result)</summary>

```bash
cd workers/ingest
fly launch --copy-config --name eastsound-ingest --region jnb
fly secrets set SUPABASE_URL=https://vewkhidaajdrfkedeavs.supabase.co \
                SUPABASE_SERVICE_ROLE_KEY=paste-your-key-here
fly volumes create est_data --size 3
fly deploy
```
</details>

### 1c. Run the pre-flight check — this is the checkpoint

Open a shell **inside the running container**:

- Railway: `npm i -g @railway/cli && railway login && railway link` then `railway ssh`
  (or click the service → **⋮ → Shell** if your plan shows it)
- Fly: `fly ssh console`

Then:

```bash
python -m eastsound_ingest --stations stations.csv doctor
```

**What good looks like** — six or seven lines, every one a `✓`:

```
✓ ffmpeg              /usr/bin/ffmpeg
✓ Station panel       7 of 7 enabled; 6 resolved via Radio Browser
✓ Output sink         supabase
✓ Service-role key    set (…)
✓ Database            reachable; schema present
✓ Evidence bucket     evidence
! Fingerprint index   empty — every play will be reported as unmatched
    → Enroll masters: python -m eastsound_ingest enroll-dir /masters
```

The one `!` is expected before step 2. Any `✗` prints its own fix line; the
usual three:

| `✗` line | Fix |
| --- | --- |
| `ffmpeg not on PATH` | Root Directory is not `workers/ingest`, so it built without our Dockerfile |
| `Service-role key missing or far too short` | Variable name typo, or still in Vercel instead of Railway |
| `Database unreachable` | `SUPABASE_URL` has a trailing slash or the wrong project ref |

👉 **Send me that output** (it contains no secrets) and I'll confirm before the
next step.

---

## Step 2 · Enrol 5–20 masters (≈20 min, mostly gathering audio)

The worker can only recognise songs it has been taught. Without this every play
lands in the "unmatched" queue.

**What audio to use:** 30–60 seconds from the middle of each track, clean
(no DJ talk-over, no ad, no jingle), and the same recording that radio stations
actually air. 5–10 is enough to prove the pipeline; 20+ is a working catalogue.

**Naming matters.** `Artist - Title.ext` — the file name *is* the metadata:

```
Jovan - Kampala Nights.wav
Ama - Nile Breeze.mp3
DJ Ssem - Sunset Taxi.flac
```

### Option 1 — no file transfer (easiest)

1. Supabase → **Storage → New bucket** → name `masters-inbox` → **Public
   bucket: ON**. Upload the files in the browser.
2. Click each file → copy its **public URL**.
3. In the worker shell, write a manifest — one URL per line, `#` for comments:

   ```bash
   cat > /app/data/masters.txt <<'EOF'
   # masters, one per line
   https://vewkhidaajdrfkedeavs.supabase.co/storage/v1/object/public/masters-inbox/Jovan%20-%20Kampala%20Nights.wav
   https://vewkhidaajdrfkedeavs.supabase.co/storage/v1/object/public/masters-inbox/Ama%20-%20Nile%20Breeze.mp3
   EOF
   python -m eastsound_ingest enroll-list /app/data/masters.txt
   ```

   A bad link is reported and skipped; the batch keeps going. Re-running the
   same manifest adds nothing.

4. **When it finishes, make the bucket private again** (Storage → bucket →
   settings) and delete it. The fingerprints are already stored on the volume.

### Option 2 — copy the files onto the volume

```bash
mkdir -p /app/data/masters
# Fly:  fly sftp shell   →  put /local/path/"Jovan - Kampala Nights.wav" /app/data/masters/
# Railway: railway ssh, then paste-base64 the files, or use Option 1
python -m eastsound_ingest enroll-dir /app/data/masters
```

### Checkpoint

```bash
python -m eastsound_ingest --stations stations.csv doctor   # now shows: ✓ Fingerprint index  7 tracks
```

Expect `✓ Fingerprint index  7 tracks` and no blocking `✗`. Once the first real
play is detected (within minutes on an enabled station), I can prove the whole
chain: detection row → evidence clip in Storage → `public_top_chart()` returns it.

👉 Tell me "masters enrolled" with the track count and I'll verify from the
database side.

---

## Step 3 · Merge (one word from you)

Reply **`merge`** and I will:

1. merge PR #22 into `main` (`gh pr merge 22 --merge`),
2. wait for the production deployment and confirm CI stays green,
3. check production against the live database — the chart should say
   *"Monitoring is on — the chart is warming up"* until the first detections
   land, then switch to real rows,
4. verify the `/api/health` readiness report and the setup console,
5. walk the four role sign-ups and confirm each sees only its own data.

Nothing in step 1 or 2 is wasted if you merge first — the worker is independent
of the website deploy.

---

## Step 4 · Your own email sender (SMTP) (≈15 min)

Supabase's built-in mailer is rate-limited and lands in spam, which is fine for
testing and not fine for real clients.

1. **Pick a provider.** [Resend](https://resend.com) is the least work: create
   an account, **add your domain** (`eastsound.ug` or whatever you own), add the
   DNS records it shows you, wait for "Verified".
2. **Get the SMTP details** (Resend → SMTP):
   - Host `smtp.resend.com`, port `465`, username `resend`,
     password = your API key (`re_…`).
3. **Supabase → Project Settings → Authentication → SMTP Settings** → *Enable
   custom SMTP*, paste host/port/user/password, set **Sender email**
   (`no-reply@eastsound.ug`) and **Sender name** (`East Sound`). Save.
4. **Send yourself a test**: Authentication → Users → *Invite* your own address.
   If it arrives, the sender works.
5. **Turn confirmation back on**: Authentication → **Sign In / Providers →
   Email → Confirm email: ON** (it is currently off so you could sign in
   during setup).
6. Confirm **Site URL** is `https://bmat-rho.vercel.app` (or your domain) under
   Authentication → URL Configuration.

👉 Tell me when the test email arrives; I'll re-run the sign-up → confirm →
sign-in flow end to end.

---

## Step 5 · Switch alerts on (≈20 min, can wait a week)

The sender is built and tested; it stays silent until it has credentials.

**Email alerts first (5 minutes):**

1. Resend → **API Keys → Create** → copy `re_…`.
2. Vercel → project `eastsound` → **Settings → Environment Variables** (all
   environments):

   | Name | Value |
   | --- | --- |
   | `CRON_SECRET` | any long random string (e.g. `openssl rand -hex 24`) |
   | `SUPABASE_SERVICE_ROLE_KEY` | the secret key from step 1a |
   | `RESEND_API_KEY` | `re_…` |
   | `ALERT_FROM_EMAIL` | `alerts@eastsound.ug` (must be on the verified domain) |

3. **Redeploy** (Deployments → ⋯ → Redeploy) so the function picks up the
   variables.
4. **Tell the scheduler where to knock:** GitHub → repo → Settings → Secrets and
   variables → Actions → new secrets `CRON_URL`
   (`https://bmat-rho.vercel.app/api/cron/alerts`) and `CRON_SECRET` (same
   string). The included workflow then sweeps every 15 minutes.
5. **Prove it:**

   ```bash
   curl -fsS "https://bmat-rho.vercel.app/api/cron/alerts?limit=1" \
     -H "Authorization: Bearer $CRON_SECRET"
   ```

   Good: `{"ok":true,"channels":["email"],"enqueued":0,"picked":0,...}`
   `"channels":[]` means a provider variable is missing.

**WhatsApp (when you're ready):** Meta → developers.facebook.com → *Create app*
→ type **Business** → add the **WhatsApp** product → note the **Phone number
ID** and create a **permanent token** under Business Settings → System users.
Then add `WHATSAPP_PHONE_NUMBER_ID` and `WHATSAPP_TOKEN` in Vercel and redeploy.
WhatsApp is used whenever a person has saved a number; email is the fallback.

Each user turns alerts on in their dashboard (*Alerts* tab → number → toggles),
and the same screen lists the last alerts with "Sent by WhatsApp", "Queued" or
"Not delivered — <reason>".

---

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| Railway build fails on `COPY stations.csv` | Root Directory not set to `workers/ingest` |
| Worker logs `Permission denied: …/fingerprints.db` | Volume not mounted at `/app/data` |
| Railway build fails on `VOLUME` | Old Dockerfile — pull the latest `main` |
| `doctor` says `! Fingerprint index empty` forever | Step 2 not done, or enrolled into a different `EST_INDEX_PATH` |
| Chart empty on production | No detections yet — check the worker log for `detected` lines, then `doctor` |
| `/api/cron/alerts` returns 503 | `CRON_SECRET` missing in Vercel (the endpoint refuses to run unauthenticated) |
| Alerts enqueued but never sent | `channels` in the response is `[]` → provider variables missing, or the person has no number/email saved |

## What is already done and verified

- Supabase schema, 25 RLS policies, evidence bucket, realtime publication.
- Realtime dashboards (20 s polling + Postgres changes, pauses when the tab hides).
- Worker: station panel, fingerprinting, evidence clips, `doctor`, `enroll-list`.
- Alert outbox, WhatsApp/email sender, delivery history, cron endpoint.
- 325 web tests + 6 worker suites, all green in CI on every push.
