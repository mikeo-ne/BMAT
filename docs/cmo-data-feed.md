# CMO distribution pack & read-only airplay feed

_Last updated 10 November 2026._

Two ways to get airplay data out of East Sound without a login:

1. **Monthly distribution pack** — a PDF (per-station report + top works) and a CSV, from the
   CMO dashboard under **Monthly Distribution Pack**. Built in the browser from rows the
   signed-in account may already read.
2. **Read-only feed** — `GET /api/feed/airplay`, JSON or CSV, for a CMO's own systems.

Both are built from the same rows and the same month boundaries, so the document a CMO files
and the data its systems import cannot disagree.

## Why it exists

UPRS (and any CMO) distributes money per station, per month. Radiomonitor sells this as "ALM"
(airplay-log matching); SongBoost does not offer it at all. The pack is the artefact that turns
our detection data into a distribution decision — and the feed is what lets a CMO stop
re-keying numbers by hand.

## Monthly pack

- **Month selector** — the current month and the five before it, in Kampala time.
- **Per-station table** — station, region, plays, distinct works, distinct artists, plays with a
  10-second evidence clip, first and last play.
- **Top works** — rank, title, artist, rights owner, plays, stations.
- **PDF** — landscape A4, headed *East Sound — CMO Monthly Distribution Pack*, with the month
  range, totals, evidence share, and a footer stating that the rows reflect only what the
  signed-in account may read. Sample data is stamped **SAMPLE DATA — not a production report**.
- **CSV** — the per-station report; a second link downloads the top works.

Numbers come from two SQL functions, both `SECURITY INVOKER` so Postgres row-level security
filters them exactly as it filters the dashboard:

| Function | Returns |
| --- | --- |
| `station_month_report(p_from date, p_to date)` | one row per station: spins, works, artists, with_evidence, first_play, last_play |
| `month_top_works(p_from date, p_to date, p_limit int)` | rank, title, artist, owner, spins, stations |

Month boundaries are Kampala dates (`Africa/Kampala`), so a 00:30 play on the 1st belongs to
the new month, not the old one.

## Feed

```
GET /api/feed/airplay?month=2026-11&format=json
Authorization: Bearer <supabase access token>
```

### Parameters

| Name | Default | Notes |
| --- | --- | --- |
| `month` | current Kampala month | `YYYY-MM`; anything else is a `400` |
| `format` | `json` | `json` or `csv` |
| `station` | all stations | station slug, matched with `ilike` |
| `limit` | `10000` | clamped to `50000` |

### Response (JSON)

```json
{
  "meta": {
    "month": "2026-11",
    "from": "2026-11-01",
    "to": "2026-11-30",
    "station": null,
    "rows": 1,
    "limit": 10000,
    "generated_at": "2026-11-10T12:00:00.000Z",
    "source": "https://eastsound.vercel.app",
    "note": "Rows are limited to what the bearer token's account may read (row-level security)."
  },
  "rows": [
    {
      "detected_at": "2026-11-02T05:14:00+00:00",
      "station": "Capital FM",
      "region": "Central",
      "source": "stream",
      "title": "Kampala Nights",
      "artist": "Nalu Akello",
      "isrc": "UGABC2600001",
      "confidence": 91.5,
      "duration_sec": 198,
      "evidence_path": "2026/11/02/capital.wav"
    }
  ]
}
```

### Response (CSV)

`format=csv` returns the same columns as a header row, UTF-8 with a BOM (so Excel reads
Luganda names and accents correctly), CRLF line endings, and
`Content-Disposition: attachment; filename="east-sound-airplay-2026-11.csv"`. Row count is
echoed in `X-Feed-Rows`.

### Errors

| Status | When | Body |
| --- | --- | --- |
| `400` | bad `month` / over-long `station` | `{ "error": "month must look like 2026-11" }` |
| `400` | query rejected by the database | `{ "error": "Feed query failed", "detail": "…" }` |
| `401` | no bearer token, or the token is invalid/expired | `{ "error": "Missing bearer token", "hint": "…" }` |
| `503` | deployment has no Supabase URL/key | `{ "error": "Feed is not configured on this deployment" }` |

## Security model

The route **never** decides what a caller may see. It forwards the caller's access token to
PostgREST, so the `detections` row-level policies answer that question — the same answer the
dashboard gets:

- a **CMO** account sees the whole panel;
- a **label** sees its own catalogue's plays;
- an **artist** sees its own recordings;
- a **broadcaster** sees the plays on its stations;
- no token, no rows.

There is no service-role key anywhere in the feed path, and no way to ask for someone else's
rows by adding a parameter.

Tokens are Supabase access tokens (about an hour). For scheduled imports, refresh with the
standard Supabase auth endpoint and call the feed with the fresh token. A long-lived
per-organisation key is deliberately not implemented yet: it would need a way to act *as* an
organisation without bypassing RLS, and that is a design decision for when a CMO actually asks.

## Verification

```bash
# no token → 401
curl -s -o /dev/null -w '%{http_code}\n' https://eastsound.vercel.app/api/feed/airplay

# with a CMO token → your month's rows
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://eastsound.vercel.app/api/feed/airplay?month=2026-11" | head -40

# CSV for an accountant
curl -s -H "Authorization: Bearer $TOKEN" -OJ \
  "https://eastsound.vercel.app/api/feed/airplay?month=2026-11&format=csv"
```

`tests/feed-airplay.test.ts` (10 tests) covers the auth contract, month scoping in Kampala
time, station filtering, limit clamping, the CSV byte order mark and the error paths;
`tests/cmo-report.test.ts` (15 tests) covers month boundaries, totals, sorting and the
documented columns.
