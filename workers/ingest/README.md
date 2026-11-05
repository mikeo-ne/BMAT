# East Sound — Stream Ingest Worker

Listens to radio stations' online streams 24/7, recognises every song from your
reference catalogue, and writes airplay detections (with a 10-second evidence
clip) into Supabase. It feeds the CMO, Label, Artist and Broadcaster dashboards.

```
station stream ──ffmpeg──▶ 11 kHz mono ──▶ 10 s window every 4 s ──▶ fingerprint
                                                                    │
            Supabase ◀── detection + evidence MP3 ◀── play tracker ◀┘ match vs. catalogue
```

## Quick start

Needs Python 3.11+ and `ffmpeg`.

```bash
cd workers/ingest
pip install -r requirements.txt

# 1. Build the reference catalogue (filenames "Artist - Title.mp3")
python -m eastsound_ingest enroll-dir ~/masters/          # a folder on this machine
python -m eastsound_ingest enroll-list masters.txt       # URLs or paths, one per line — no file transfer
#    or one file, linked to its Supabase recordings.id:
python -m eastsound_ingest enroll master.wav --title "Kampala Nights" --artist "Nalu Akello" \
       --recording-id 0b9f...-uuid --isrc UG-PSR-26-00011

# 2. Check a clip
python -m eastsound_ingest identify clip.mp3

# 3. Monitor live (dry run: results go to data/out/)
python -m eastsound_ingest --stations stations.csv run
```

Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (see `.env.example`) to write to
Supabase instead. Run migration `supabase/migrations/0002_stream_ingest.sql` first.

## Deploy

```bash
docker build -t eastsound-ingest .
docker run -d --restart unless-stopped --env-file .env -v ingest-data:/app/data eastsound-ingest
```

Run it on any always-on Linux server (a $10–40/month VPS handles dozens of
stations). **Not** Vercel — it's a long-running process, not a web request.
The service-role key stays on this server only; never put it in the website.

## Stations

`stations.csv` is a byte-identical copy of the panel of record,
`supabase/seed/uganda_stream_stations.csv` — the same 14 stations the platform
publishes. **Edit the seed, then copy it here** (or CI will fail the panel
drift check):

```bash
cp supabase/seed/uganda_stream_stations.csv workers/ingest/stations.csv
```

The loader understands that panel's schema directly:

| Column | Meaning |
|---|---|
| `stream_host` | A URL, or host+path without a scheme (`dc4.serverse.com/proxy/pearlfm/stream`) → used as the stream URL. A bare host is ignored and resolved through Radio Browser instead of guessing a path. |
| `directory_status` | `OK` / `OK (stale)` → station is monitored. `listed …` → known station, no captured stream yet, so it stays idle. An explicit `enabled` column, if present, overrides this. |
| `region` | Parenthetical notes collapse to the reporting region (`Central (Masaka)` → `Central`). |

Seven stations are monitored today; the other seven are listed but idle until
their stream is captured. A legacy `stations.csv` with `stream_url` and
`enabled` columns still loads, so existing deployments keep working.

```bash
python -m tests.test_panel     # drift, parse, enable rules, URLs, regions
```

## What it records

| Event | Where | Contents |
|---|---|---|
| Detection | `detections` | station, recording, start, end, duration, match strength, position in master, evidence clip path |
| Unmatched sample | `unmatched_clips` | at most one clip / station / 10 min when nothing matches — for the CMO review queue |
| Heartbeat | `stations` | stream status, now playing, last seen (every 60 s) |

Evidence clips go to the private `evidence` Storage bucket.

## Tested (see `tests/`)

`python -m tests.test_broadcast` builds a 15-minute simulated broadcast — talk,
ads, unknown songs, a presenter over an intro, a back-to-back replay and an
early fade-out — degraded with EQ, limiting, hiss and 64 kbps MP3, then checks
every play:

- **8/8 plays detected**, start and end within ~1 second, **0 spurious**
- 0 false positives on 30 unknown-song and talk clips
- ~100× faster than real time per station (one CPU core ≈ dozens of stations)
- Live HTTP stream test: detects while streaming, survives a dropped connection

These are synthetic signals. Before going live, test against real recordings of
each station with real masters enrolled, and tune `MIN_ALIGNED` in `index.py`
if you see misses (lower) or wrong matches (higher).

## Brand mentions (spoken on air)

Optional. Set `EST_MENTIONS=1` and the worker also listens to the **talk** on each
station (never during a matched song) and reports when a tracked brand is said:
live reads, presenter shout-outs, sponsor credits.

- **Pre-recorded adverts are better caught by fingerprinting.** Enroll the ad file like
  a song (`enroll ad.mp3 --title "Bell Lager 30s" --artist "Advert"`); every airing then
  matches exactly. Speech recognition is for words a presenter says.
- Talk is cut into 15 s pieces (2 s overlap) and transcribed with Whisper (`base.en` by
  default; `small.en` is more accurate but needs ~4 CPU cores for 7 stations), downloaded once from the sherpa-onnx GitHub releases and checked against a
  pinned SHA-256). Brand names are matched by spelling **and** sound, because
  recognisers spell local names unpredictably ("Stanbic" → "Stambic", "Rwenzori" → "our wensory").
- Brands come from the dashboard (**CMO → Brand Mentions**, table `tracked_keywords`,
  refreshed every 10 min) or, without Supabase, from `keywords.csv`.
- Each hit is saved to `mentions` with the transcript, the matched words and the 15 s
  clip, as **To review**. The CMO confirms or rejects it; confirming a misheard spelling
  adds it as a "heard as" alias for next time. Broadcasters see mentions on their own stations.
- If the CPU can't keep up, the oldest waiting pieces are skipped and counted
  (`speech: … skipped` in the status log) instead of falling further behind.

**Calibrate before relying on it:** record an hour of a real station and run
`python -m eastsound_ingest transcribe recording.mp3` to see exactly what the recogniser
hears and which brands match.

**How accurate is it?** Measured on 135 test clips — 20 ad reads and 25 everyday lines
chosen to sound like brands, each read by 3 synthetic (Piper) voices, degraded like a
64 kbps stream: `small.en` found **72%** of brand mentions; `base.en` found 64%. The only
false alarm was "ring the bell later" heard as *Bell Lager* — a genuine near-homophone,
which is why every mention goes through review. Synthetic voices are not Ugandan presenters,
and these thresholds were tuned on the same clips: expect different numbers on real radio.

**Luganda:** standard Whisper has no Luganda. Brand names usually still come through in
English mode. For full Luganda transcription, Sunbird AI's
`Sunbird/faster-whisper-51-african-languages` (Whisper large-v3 fine-tuned for 51 African
languages) works with `EST_ASR_ENGINE=faster-whisper` but needs a GPU to keep up live.

## Limits to know

- It only recognises songs you've **enrolled**. Unknown songs land in the unmatched queue.
- Timestamps are when audio arrived at the worker; online streams can run a few
  seconds to a minute behind FM.
- An online stream can differ from FM (some stations swap ads online). For ad
  proof-of-play disputes, FM receiver nodes are the stronger evidence.
- The fingerprint index is a local SQLite file — fine for tens of thousands of
  recordings. Beyond that, move it to a dedicated store.
- Writes that still fail after 3 retries are logged to `data/out/failed-events.log`
  but not yet replayed automatically.
