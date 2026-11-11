# TV ingest

_Written 10 November 2026._

A TV channel is **a station row with `kind = 'tv'`**. There is no second pipeline: the worker pulls the
stream with ffmpeg, fingerprints it, writes detections and evidence exactly as it does for radio, and every
existing feature — charts, clips, alerts, the CMO pack, the feed — works unchanged.

## What shipped

- `stations.kind` (`radio` | `tv`, default `radio`) and an index — migration `0016_tv_stations.sql`.
- `detections.source` accepts `tv`, so reports can separate TV from radio without guessing from the name.
- Coverage counts radio and TV separately: `/coverage` shows "28 radio · 3 TV" and a TV figure per region.
- The worker reads `kind` from the station panel, tags detections with `source: "tv"`, and gives HLS URLs
  live-edge ffmpeg flags (`-live_start_index -1`, `+genpts`) so a TV feed starts at *now*, not at the
  beginning of the playlist.
- `workers/ingest/stations.tv.example.csv` — the template. Rows have no URL on purpose: **we do not invent
  stream addresses**, and the worker reports `no_stream_url` instead of guessing.
- `workers/ingest/tests/test_tv.py` — 16 checks (defaults, CSV parsing, HLS flags, template integrity),
  wired into CI.

## Adding NBS, Bukedde or UBC

The code path is ready; what we still need is an address we are allowed to use. For each channel:

1. **Get the official stream.** Ask the broadcaster for its HLS endpoint (`https://…/playlist.m3u8`) or
   RTMP ingest. Public YouTube/Facebook live links are not usable directly — they need a different
   extractor and sit outside the broadcaster's terms. Do not scrape them.
2. **Confirm the right to monitor.** A TV channel is a broadcaster client: they should be told their signal
   is being fingerprinted, and ideally be on a Broadcaster plan. The 2026 Copyright Amendment makes this a
   conversation worth having *before* the feed is live, not after.
3. **Add the row** (this writes into the platform panel; the worker picks it up on its next start):

   ```bash
   # one row per channel
   slug,station,region,kind,stream_url
   nbs-tv,NBS TV,Central,tv,https://…/nbs.m3u8
   bukedde-tv,Bukedde TV,Central,tv,https://…/bukedde.m3u8
   ubc-tv,UBC TV,Central,tv,https://…/ubc.m3u8
   ```

   In practice: insert into `public.stations` with `kind = 'tv'` and `stream_url`, or add the rows to
   `supabase/seed/uganda_stream_stations.csv` and copy that file to `workers/ingest/stations.csv` (the panel
   test enforces that the two stay identical).
4. **Watch the first hour.** `worker` logs each detection with station, title and timestamps; the station's
   `stream_status` should move `starting → online`. If ffmpeg cannot open the URL, the row sits at
   `no_stream_url` and nothing silently pretends to monitor it.
5. **Tell the truth on the site.** `/coverage` reads `kind` from the database, so the TV count changes the
   moment a channel is monitored — no copy to edit, and no claim before the fact.

## AfroMobile / MTN TV

If the question is "can we just take the streams AfroMobile already carries?", the answer is no — they are
subscriber-gated and paid, and pulling them would break the broadcaster relationship we need. What AfroMobile's
scale does tell us is where the audience is: 60+ TV channels and 53 radio stations after the MTN TV launch in
August 2026. `docs/afro-mobile.md` has the numbers, the three routes we can actually take (public broadcaster
feeds, a data partnership, DVB-T2 capture), and the outreach text.

## Cost note

A 1080p TV stream decoded to 11 kHz mono PCM is roughly the same CPU as a radio stream (decode dominates,
not resolution). Three channels fit comfortably alongside 28 radio streams on the current worker box; the
constraint is bandwidth, not fingerprinting.
