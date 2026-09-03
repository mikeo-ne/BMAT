# BMAT

**Broadcast Music Analytics** — measures music airplay across Uganda's FM panel and gives artists,
labels and stations one shared source of truth for spins.

Currently built:

- **Artist & Label Portal** — [`/dashboard/artist`](app/dashboard/artist/page.tsx)
- **Live Station Monitor** — [`/dashboard/monitoring`](app/dashboard/monitoring/page.tsx)

---

## Live Station Monitor

### Station grid

Ten monitored Ugandan feeds — Capital FM 91.3, CBS FM 89.2, Galaxy FM 100.2, NBS TV (Ch. 34 DTT),
KFM, Bukedde FM, Better FM, Radio West, Mega FM and Upcountry FM — spanning all four regions.
Defined in [`lib/monitoring.ts`](lib/monitoring.ts).

Each card carries:

- **Live status indicator** — `Live` / `Degraded` / `Offline` with feed latency and 24h uptime.
  Telemetry is seeded per station and drifts every 2.5s, so the panel reads as live.
- **Audio player widget** — transport, volume and a rolling signal-level history. One feed plays at
  a time.
- **Real-time waveform visualizer** — a canvas oscilloscope reading the `AnalyserNode` in the signal
  path on every animation frame. It is the sound you hear, not an animation beside it; a paused
  card settles to the baseline so idle cannot be mistaken for live.
- **Last Detected Track badge** — title, artist, ISRC, confidence bar and detection time, or an
  explicit "Unmatched audio — not in the catalogue" / "No detection yet".

### Audio

This environment cannot reach live broadcast streams, so the widget plays a locally synthesized
stand-in for a station's feed ([`lib/monitor-audio.ts`](lib/monitor-audio.ts)): a pink-noise bed
through a bandpass plus three LFO-modulated partials. Swapping in a real stream means pointing
`start()` at a `<audio>` element via `createMediaElementSource` — nothing downstream changes.

### Fingerprint scan

**Run Audio Fingerprint Scan** walks the panel and appends detections to the live feed, one station
at a time. Each entry carries a UTC timestamp, station name and frequency, track title, artist, ISRC,
confidence, matched-window length and the matching method. Roughly one in eight falls below the 60%
match threshold and is recorded as **unmatched** rather than dropped — unmatched audio is the signal
that a delivery is missing from the catalogue. Stations whose feed is offline produce no detection.

Matching is a pure, seeded function (`simulateScan`), so it is fully unit-tested.

---

## Artist & Label Portal

### What's on the page

**1. Delivery uploader** — a drag-and-drop dropzone for MP3/WAV masters.

- Native HTML5 drag & drop, plus click-to-browse; multiple files stage a whole release at once.
- Client-side validation before anything is sent: extension, non-audio rejection, empty files and
  an 80 MB per-file ceiling. Rejections are listed with a reason instead of failing silently.
- Each accepted file is probed in-browser for duration and gets a playable preview.
- `Artist - Title (ft. Someone).mp3` file names are parsed to prefill the metadata form.

**2. Metadata form** — Song Title, Primary Artist, Featured Artists, Release Date and ISRC.

- Featured artists are split on `,` `;` `&` `and` `x` `/` into individual royalty participants.
- **Generate ISRC** allocates the next free code in the registrant's year block rather than a random
  one, so two deliveries from the same label in the same year never collide. Format is the IFPI
  standard `CC-XXX-YY-NNNNN` with `CC = UG`. See [`lib/isrc.ts`](lib/isrc.ts).
- ISRC is validated live; a valid code registered outside Uganda is accepted but flagged.
- Delivery is blocked until an audio master is attached and every required field validates.

**3. Active catalogue** — every uploaded track with its total spins across the Uganda FM panel.

- Columns: track + artists, ISRC, release date, master format, reporting stations, total spins with
  week-over-week change, a 14-day trend sparkline and the regional airplay split.
- Sortable on track, release date, stations and spins; searchable across title, artist and ISRC.
- Selecting a region re-points the spin and station columns at that region and re-ranks the table.

**4. Airplay by region** — Central, Eastern, Western and Northern.

- Bar chart of spins per region, plus a stacked "top tracks × region" view.
- Region cards show spins, share of total, reporting stations against panel size, and reach.
- Clicking a bar or card filters the catalogue table to that region.

### The airplay model

Until station playout feeds are wired up, [`lib/airplay.ts`](lib/airplay.ts) derives a deterministic
14-day panel read-out from the track's ISRC and release date:

- regional totals are weighted by the reach of each region's station panel, so Central leads;
- a **campaign factor** scales the total by release age — a launch ramp, a plateau, then catalogue decay;
- per-day noise sits on top of the campaign curve, because rotation never repeats a day exactly;
- the whole thing is seeded from a stable hash, so the catalogue never re-shuffles between requests.

`sum(trend) === spins` holds for every region, and the tests assert it.

## Getting started

```bash
npm install
npm run dev          # http://localhost:3000 → redirects to /dashboard/artist
```

```bash
npm test             # vitest, 166 tests
npm run typecheck    # next typegen && tsc --noEmit
npm run lint         # eslint
npm run build        # production build
```

### API

| Method   | Path                 | Purpose                                                      |
| -------- | -------------------- | ------------------------------------------------------------ |
| `GET`    | `/api/tracks`        | Catalogue rows                                               |
| `POST`   | `/api/tracks`        | Deliver a master (`multipart/form-data`) — validates, stores, assigns airplay |
| `PUT`    | `/api/tracks`        | Allocate the next free ISRC for a registrant + release year   |
| `DELETE` | `/api/tracks/:id`    | Withdraw a track and delete its stored master                |

`POST` returns `422` with per-field errors (`title`, `primaryArtist`, `releaseDate`, `isrc`, `audio`)
so the form can surface them inline.

## Storage

There is no database yet. Track rows live in `.data/tracks.json` and delivered masters in
`.data/uploads/` — both gitignored, both created on first read. The first read seeds six demo tracks.

[`lib/store.ts`](lib/store.ts) is the only module that touches the filesystem and deliberately exposes
the shape a real repository would, so moving to Postgres later is a one-file change.

> **Demo data.** The seeded catalogue, the station panel in [`lib/regions.ts`](lib/regions.ts) and
> every spin count are synthetic fixtures. Artist names are invented and no figure here is real
> reporting for a real recording.

## Layout

```
app/
  dashboard/
    artist/page.tsx        the portal (server component, reads the catalogue)
    monitoring/page.tsx    live station monitor
    layout.tsx             sidebar + topbar shell
  api/tracks/              route handlers
components/
  artist-portal.tsx        client state: staging, delivery, filtering
  upload-dropzone.tsx      drag & drop, validation, staged file list
  track-metadata-form.tsx  the five metadata fields + ISRC generator
  catalog-table.tsx        sortable/searchable catalogue
  region-airplay-chart.tsx regional breakdown
  station-monitor.tsx      monitor grid, telemetry drift, scan orchestration
  station-card.tsx         status, player, waveform, last-detected badge
  waveform.tsx             canvas oscilloscope driven by the AnalyserNode
  detection-feed.tsx       timestamped fingerprint matches
lib/
  isrc.ts                  ISRC generation, validation, parsing
  airplay.ts               seeded airplay model
  catalog.ts               track construction, seed rows, designation allocation
  store.ts                 file-backed catalogue store (server-only)
  regions.ts               Uganda regions + FM station panel
  monitoring.ts            monitored panel, telemetry, fingerprint matching
  monitor-audio.ts         synthesized monitor feed (Web Audio)
  format.ts  types.ts  upload.ts
tests/                     vitest unit + component tests
```

## Stack

Next.js 16 (App Router, Turbopack) · React 19 · TypeScript · Tailwind CSS 4 · Recharts · Vitest

Geist is self-hosted via the `geist` package (`next/font/local`) so builds do not depend on
`fonts.googleapis.com` being reachable.
