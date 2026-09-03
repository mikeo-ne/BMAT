# BMAT

**Broadcast Music Analytics** — measures music airplay across Uganda's FM panel and gives artists,
labels and stations one shared source of truth for spins.

Currently built:

- **Artist & Label Portal** — [`/dashboard/artist`](app/dashboard/artist/page.tsx)
- **Live Station Monitor** — [`/dashboard/monitoring`](app/dashboard/monitoring/page.tsx)
- **CMO & Regulatory Audit** — [`/dashboard/cmo`](app/dashboard/cmo/page.tsx)

---

## CMO & Regulatory Audit

An enterprise ledger for **UPRS** (Uganda Performing Right Society) built from the same catalogue and
airplay model the artist portal uses. See [`lib/uprs.ts`](lib/uprs.ts).

### The ledger

`buildPlayLedger` expands the catalogue into aggregated **member × station × period** rows:

1. each recording's regional 14-day spins are annualised to a month,
2. scaled by the campaign factor for that month, so history peaks near release and decays as catalogue,
3. split across each region's reporting stations in proportion to reach,
4. then divided between the rights holders on the recording.

Nothing accrues before a recording's release date. ~704 rows across 32 stations and 6 periods on the
seeded catalogue — about 62,300 plays and a UGX 19.8m pool.

**Distribution policy** — primary artist 60%, featured artists split the remaining 40% equally; a
solo recording takes 100%.

### Filters

Four multi-select dropdowns, each with search, select-all and clear:

- **Station** — every reporting station, hint shows its region and tariff tier
- **Region** — Central / Eastern / Western / Northern
- **Date range** — the reporting months present in the ledger
- **Artist Membership ID** — every rights holder, with their work count

Empty means "no constraint". Active filters appear as removable chips.

### Distribution report

**Generate Distribution Report** computes over the filtered rows and shows total play count, the
estimated royalty pool in UGX and indicative USD, members payable, a flat-rate breakdown by station
tier, a per-region split, and a per-member allocation table sorted by amount with each member's share
of the pool.

Two CSV downloads — the full ledger behind the report, and the summary plus per-member allocation.
Both are generated client-side and prefixed with a UTF-8 BOM so Excel reads them correctly.

> **The tariff is a placeholder.** `TARIFF`, `DISTRIBUTION_POLICY` and `UGX_PER_USD` in
> [`lib/uprs.ts`](lib/uprs.ts) are invented to make the arithmetic visible end to end. They are **not**
> the published UPRS schedule. The report says so on the page and in the CSV header. Replace them
> before any figure reaches a member or a licensee.

---

## Ad Campaign Auditor — `/dashboard/advertisers`

Advertisers book airtime and BMAT audits it against fingerprinted playout.

- **Campaign creation** — upload the jingle as an MP3 and set the contract in the
  shape a media buyer writes it: *5x daily between 06:00 and 10:00 on Capital FM, for 14 days*.
  Validated on MP3 type, a 12 MB ceiling, a window that closes after it opens, and 1-12 spots a day.
- **Compliance gauge** — a 270° SVG dial of verified in-window spots against contracted spots, with
  the breached and never-aired counts alongside. Pure SVG, so it is deterministic in SSR.
- **Time-of-day heatmap** — station × hour grid in East Africa Time. Cells inside the contracted
  window are tinted differently from cells outside it, so an off-window buy is visible at a glance.
- **Fraud / missed-airtime queue** — three breach types, worst first. *Missed* is a hard breach (the
  spot never aired); *off-window* and *unverified* ran but cannot be billed as booked.

Slots are generated deterministically per campaign ([`lib/advertising.ts`](lib/advertising.ts)), so a
campaign always audits the same way. Campaigns booked through the form live in component state —
there is no server round-trip yet, so a refresh returns to the four seeded buys.

---

## Unidentified Audio & DJ Mix Parser — `/dashboard/mix-parser`

- **60-minute timeline** — a seekable SVG waveform over a downsampled amplitude envelope, with each
  segment tinted by what the parser made of it. Click to seek, play to advance the playhead.
- **Transition markers** — every music hand-over is marked and listed with both sides named, and any
  gap over three seconds is flagged as dead air.
- **Unidentified segment queue** — anything under the 60% confidence floor, with its confidence bar.
  An unidentified play is a royalty nobody is being paid for, so the queue is a work list.
- **A&R tagging modal** — listen to a 10-second excerpt, search the catalogue by title, artist or
  ISRC, and link the clip. Each link keeps the confidence the parser originally returned, which is
  what would let the matcher be retrained.

> The hour is generated deterministically per station and the excerpt is synthesised locally through
> the same `MonitorFeed` the station grid uses. There is no captured stream and no reference index,
> so nothing here is a recognition result.

---

## Rights & Split-Sheet Management — `/dashboard/splits`

- **Ownership donut** — shares drawn against 100 rather than against the sheet total, so a sheet
  that over-allocates visibly overflows instead of quietly renormalising. Hover a slice to isolate it.
- **Collaboration approvals** — who has signed, by which channel and when, with per-party reminders.
  A sheet is executable only when every collaborator has signed.
- **Dispute resolution** — the CMO queue appears both here and inside
  [`/dashboard/cmo`](app/dashboard/cmo/page.tsx), because a sheet cannot be executed while its
  registration is contested. Three shapes: two parties each claiming the whole of one right, a sheet
  totalling more than 100%, and a claim against an ISRC with no delivered recording — which cannot be
  verified at all until the work is delivered and matched.

---

## Airplay Geography & Hit Velocity — `/dashboard/analytics/regional`

- **Hub map** — Kampala, Jinja, Mbarara, Gulu and Mbale plus Nairobi and Dar es Salaam, plotted by
  longitude and latitude with marker radius tracking the week's spins. Click a hub to filter.
- **Track velocity** — radio spin growth over 7 days against a streaming-search index. Radio leading
  search usually means station push; search leading radio is the shape of an organic breakout.
- **A&R hit predictor** — tracks over 50 spins this week in a *secondary* market while Kampala is
  still quiet. That is the Ugandan break pattern: Gulu, Mbale or Mbarara first, Kampala two or three
  weeks later.

> Cross-border demand is **modelled, not measured** — BMAT has no Nairobi or Dar es Salaam panel. Hub
> spins are apportioned from the domestic airplay model by reach, and the search index is a synthetic
> proxy.

---

## Live Airplay Alerts & Webhooks — `/dashboard/alerts`

- **Notification triggers** — per track or per station, toggle WhatsApp, email and webhook
  independently. A rule with no channels stays enabled but fires nowhere, which is how an operator
  mutes one record without deleting the subscription.
- **Simulated handset** — a phone frame showing the pushes as they land, revealed one at a time on a
  timer rather than all at once, because the point is what an artist experiences. The copy comes from
  `whatsappMessage` — the same function a real gateway would call:

  > 🔥 AIRPLAY ALERT: Your track 'Katono' was just played on Capital FM (91.3 Kampala) at 15:42 EAT!
  > Verified by the UPRS registry.

- **Delivery log** — the same events as they would arrive over email and webhook, with the JSON body
  a webhook subscriber receives.

Times render in East Africa Time (UTC+3) via `formatEatClock`, even though the ledger stores UTC.

> Play events are generated deterministically from the rule set. No WhatsApp Business API, SMTP or
> webhook endpoint is connected, and nothing leaves the browser.

---

## Live Station Monitor

### Station grid

Eleven monitored Ugandan feeds — Capital FM 91.3, CBS FM 89.2, Galaxy FM 100.2, NBS TV (Ch. 34 DTT),
KFM, Bukedde FM, Better FM, Radio West, Mega FM, Upcountry FM and Radio Gaaki 89.7 (Jinja) — spanning
all four regions. Defined in [`lib/monitoring.ts`](lib/monitoring.ts), where each entry derives its
region and hub from the shared spin panel in [`lib/regions.ts`](lib/regions.ts) so the two lists
cannot drift.

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

### Live fingerprint peak detector

[`components/audio-fingerprint-visualizer.tsx`](components/audio-fingerprint-visualizer.tsx) is the
one part of the monitor that reads *real* audio. It opens the operator's microphone through
`getUserMedia`, runs it through a native `AnalyserNode`, and paints the magnitude spectrum with
extracted spectral landmarks overlaid. No audio libraries — the Web Audio API only.

Landmark extraction lives in [`lib/audio-fingerprint.ts`](lib/audio-fingerprint.ts) as a pure
function so it is testable without a canvas or an `AudioContext`. It follows the constellation
approach: a bin qualifies when it is a strict local maximum within a comparison window **and** clears
a magnitude floor, with a minimum bin spacing so a harmonic comb collapses to its strongest member
rather than firing on every partial. The DC and rumble bins are excluded.

> **Not a recognition engine.** There is no reference index to match against, so the landmarks are a
> measure of spectral salience, not identified works. The UI says so, and the recognition path stays
> the simulated `simulateScan` above.

Two operational notes:

- `getUserMedia` needs a secure context, so the preview must be served over HTTPS.
- Denied, missing-device and unsupported-browser cases each surface a distinct message in the panel
  rather than failing to the console.

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

Rendered by [`components/airplay-table.tsx`](components/airplay-table.tsx), which is a reusable
table rather than a portal-specific one. Every piece of chrome is opt-in: pass `onDelete` to get the
remove action, `onFocusRegion` to get the region switcher, and `title`/`emptyHint` to reframe it.
With none of them it degrades to a read-only read-out.

- Columns: track + artists + genre, ISRC, release date, master format, reporting stations, total
  spins with week-over-week change, a 14-day trend sparkline and the regional airplay split.
- Sortable on track, release date, stations and spins; searchable across title, artist, genre and ISRC.
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

## National Charts — `/dashboard/charts`

The public weekly national airplay chart. [`lib/charts.ts`](lib/charts.ts) ranks every recording
with spins in the last seven reporting days; last week's ranking comes from the seven days before
that, so movement, debuts and the biggest climber are read straight off the airplay curve. Peak
position is the one fixture element — the prototype keeps only fourteen days of history — and is
bounded above by the current rank so a peak can never be worse than today's slot.

---

## Database schema (migration target)

[`prisma/schema.prisma`](prisma/schema.prisma) is the reviewed persistence artefact: `User`, `Track`,
`RadioStation`, `AirplayMatch`, `RoyaltyReport` and `AdCampaign`, plus the supporting `AdSlot`,
`SplitSheet`, `SplitParty`, `RoyaltyLine` and `UnidentifiedClip` tables. Every model maps to an
in-memory counterpart that the test suite already exercises, so the field list is not aspirational.

The running prototype keeps its catalogue in `.data/` behind [`lib/store.ts`](lib/store.ts); nothing
imports the generated Prisma client yet. `tests/prisma-schema.test.ts` runs the Prisma wasm validator
in-process (no database, no Rust-engine download), so `npm test` fails if the schema stops parsing or
a relation dangles. `npm run db:validate` does the same via the CLI on a machine with normal egress.

---

## Getting started

```bash
npm install
npm run dev          # http://localhost:3000 → redirects to /dashboard/artist
```

```bash
npm test             # vitest, 231 tests
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
> every spin count are synthetic fixtures. Artist names are invented, and while the station names and
> hubs are drawn from real Ugandan radio, the name/hub/reach pairing is illustrative — this is not a
> verified UPRS station registry and no figure here is real reporting for a real recording.
>
> **Changing the seed data?** Rows persist to `.data/tracks.json` (gitignored) on first run, so edit
> [`lib/catalog.ts`](lib/catalog.ts) and delete `.data/` to re-seed.

## Layout

```
app/
  dashboard/
    artist/page.tsx        the portal (server component, reads the catalogue)
    monitoring/page.tsx    live station monitor
    cmo/page.tsx           UPRS audit ledger
    layout.tsx             sidebar + topbar shell
  api/tracks/              route handlers
components/
  artist-portal.tsx        client state: staging, delivery, filtering
  upload-dropzone.tsx      drag & drop, validation, staged file list
  track-metadata-form.tsx  the five metadata fields + ISRC generator
  airplay-table.tsx        reusable sortable/searchable airplay table
  region-airplay-chart.tsx regional breakdown
  station-monitor.tsx      monitor grid, telemetry drift, scan orchestration
  station-card.tsx         status, player, waveform, last-detected badge
  waveform.tsx             canvas oscilloscope driven by the AnalyserNode
  audio-fingerprint-visualizer.tsx  live mic spectrum + landmark overlay
  detection-feed.tsx       timestamped fingerprint matches
  cmo-audit.tsx            filter state, report generation, CSV export
  cmo-table.tsx            sortable/paginated enterprise ledger table
  dispute-alerts.tsx       overlapping ISRC registrations (splits + CMO)
  ad-auditor.tsx           campaign state, gauge, heatmap, breach queue
  campaign-form.tsx        jingle upload + contract terms
  compliance-gauge.tsx     contracted vs verified dial
  hour-heatmap.tsx         station x hour airtime grid
  airtime-alerts.tsx       missed and breached slots
  mix-parser-view.tsx      station, playhead, tagging state
  mix-timeline.tsx         60-minute seekable SVG waveform
  unidentified-queue.tsx   sub-threshold segments
  tagging-modal.tsx        10s excerpt + catalogue search + link
  split-manager.tsx        sheet selector, pie, approvals
  split-pie.tsx            ownership donut
  split-approvals.tsx      sign-off status and reminders
  regional-analytics.tsx   hub selection, velocity, predictor
  hub-map.tsx              lon/lat hub plot
  velocity-chart.tsx       spins vs search index
  hit-predictor.tsx        emerging secondary-market tracks
  alerts-view.tsx          rules, events, webhook log
  alert-settings.tsx       per-target channel toggles
  whatsapp-simulator.tsx   simulated handset
  multi-select.tsx         searchable multi-select + filter chips
  distribution-report.tsx  royalty pool, tier breakdown, member allocation
lib/
  isrc.ts                  ISRC generation, validation, parsing
  airplay.ts               seeded airplay model
  catalog.ts               track construction, seed rows, designation allocation
  store.ts                 file-backed catalogue store (server-only)
  regions.ts               Uganda regions, hubs and FM station panel
  charts.ts                weekly national chart, movement, debuts
  monitoring.ts            monitored panel, telemetry, fingerprint matching
  monitor-audio.ts         synthesized monitor feed (Web Audio)
  audio-fingerprint.ts     pure spectral landmark extraction

prisma/
  schema.prisma            persistence target (validated by tests)
  uprs.ts                  memberships, tariff, ledger, report, CSV
  advertising.ts           contracts, slots, compliance, heatmap, breaches
  mix-parser.ts            timeline, transitions, queue, waveform, search
  splits.ts                split sheets, sign-off, rights disputes
  geography.ts             hubs, hub metrics, velocity, hit predictor
  alerts.ts                channels, rules, events, push copy
  format.ts  types.ts  upload.ts
tests/                     vitest unit + component tests
```

## Stack

Next.js 16 (App Router, Turbopack) · React 19 · TypeScript · Tailwind CSS 4 · Recharts · Vitest

Geist is self-hosted via the `geist` package (`next/font/local`) so builds do not depend on
`fonts.googleapis.com` being reachable.

`next.config.ts` sets `allowedDevOrigins: ["*.e2b.app"]` so the sandboxed live preview can reach
Next's dev-only resources; without it Next 16 blocks them as cross-origin with a 403.
