# Reach & impressions — methodology

_Written 10 November 2026._

Advertisers buy "how many people heard it". Getting that wrong once ends the conversation, so this document
is deliberately conservative: **we publish an estimate only for stations whose audience figure someone else
supplied.**

## The formula

```
impressions(station, month) ≈ AQH × (music seconds aired ÷ 900)
```

- **AQH** — average quarter-hour listeners, the unit Ugandan stations already sell advertising in. It is
  stored per station (`stations.aqh`) with its **source** (`audience_source`) and **measurement date**
  (`audience_as_of`).
- **music seconds aired** — `sum(duration_sec)` of the station's matched detections for the month
  (`station_month_report().listen_seconds`). If durations are missing, we fall back to a 3:30 track, and say
  so in the code (`FALLBACK_TRACK_SEC`).
- **900** — seconds in a quarter hour. A 15-minute block of music heard by an AQH of 10,000 is 10,000
  impressions; a three-minute song is a fifth of that.

The monthly total is the sum over stations. Plays on stations without an audience figure are **excluded**,
never estimated from a regional average.

## Why AQH and not "reach"

- Reach (unique people) needs a panel with deduplication. Nobody in Uganda publishes one we can license, and
  inventing one is the fastest way to lose a CMO's trust.
- AQH is what a station's rate card quotes, so a broadcaster can hand us the number and defend it.
- Impressions derived from AQH × time are the standard broadcast currency; advertisers understand the unit
  and know it is an estimate.

## What the UI must always say

`lib/reach.ts` owns the copy, and every surface that shows a number also shows the caveat:

| Situation | Message |
| --- | --- |
| No station has audience data | "No station has supplied an audience figure yet, so no impressions are shown…" |
| Some stations have data | "Estimated reach, not a measurement: 5 of 12 stations have a declared audience figure. Stations without one are excluded, not guessed." |
| Every station has data | "Estimated reach from broadcaster-declared audience figures (AQH). Estimates, not a panel measurement." |

The share of the panel that carries audience data ("panel coverage") is shown next to the impressions tile,
because a big number from two stations is a small claim.

## How a station's figure gets in

1. The broadcaster supplies AQH from its own survey, its agency rate card, or a UCC/UBOS publication.
2. We record `aqh`, `audience_source` (who measured it) and `audience_as_of` (when).
3. The figure is re-confirmed annually; an old number is still shown, but with its date.

```sql
update public.stations
   set aqh = 18000,
       audience_source = 'Capital FM rate card, Ipsos survey Q2 2026',
       audience_as_of = '2026-06-30'
 where slug = 'capital-fm';
```

## Deliberate limits

- **No program-level audience.** A play at 03:00 is not worth the same as one at 18:00. We do not have
  quarter-hour curves per station, so we do not pretend to; when a station supplies a daypart breakdown, the
  formula can weight by it.
- **No TV-specific currency yet.** TV AQH exists in the same column, but TV measurement in Uganda is thinner.
  Treat TV impressions as the weakest number in the set and label them as such when the first channel lands.
- **No deduplication across stations.** Listening to two stations is counted twice. AQH is a per-station
  measure; combining stations never turns into unique people.
- **Impressions are not revenue.** They support ad-side conversations; royalties stay driven by plays and
  cue sheets, which are auditable to the clip.

## Verification

`tests/reach.test.ts` (13 tests) covers the formula, the null-not-zero rule, the 3:30 fallback, coverage
percentages, and every caveat branch. `station_month_report()` is `SECURITY INVOKER`, so a label sees reach
for its own catalogue only — the metric never widens what an account can read.
