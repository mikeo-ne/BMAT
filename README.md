# BMAT

**Broadcast Music Analytics** — measures music airplay across Uganda's FM panel and gives artists,
labels and stations one shared source of truth for spins.

This repository currently contains the **Artist & Label Portal** at [`/dashboard/artist`](app/dashboard/artist/page.tsx).

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
npm test             # vitest, 106 tests
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
    layout.tsx             sidebar + topbar shell
  api/tracks/              route handlers
components/
  artist-portal.tsx        client state: staging, delivery, filtering
  upload-dropzone.tsx      drag & drop, validation, staged file list
  track-metadata-form.tsx  the five metadata fields + ISRC generator
  catalog-table.tsx        sortable/searchable catalogue
  region-airplay-chart.tsx regional breakdown
lib/
  isrc.ts                  ISRC generation, validation, parsing
  airplay.ts               seeded airplay model
  catalog.ts               track construction, seed rows, designation allocation
  store.ts                 file-backed catalogue store (server-only)
  regions.ts               Uganda regions + FM station panel
  format.ts  types.ts  upload.ts
tests/                     vitest unit + component tests
```

## Stack

Next.js 16 (App Router, Turbopack) · React 19 · TypeScript · Tailwind CSS 4 · Recharts · Vitest

Geist is self-hosted via the `geist` package (`next/font/local`) so builds do not depend on
`fonts.googleapis.com` being reachable.
