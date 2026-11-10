# Connecting a station

_Written 10 November 2026._

A broadcaster with no linked station has no dashboard — no playout timeline, no cue sheet, no ads. That used
to be a dead end ("ask East Sound"). Now the broadcaster does it themselves and a CMO approves.

## The flow

1. **Broadcaster signs up** with the *Broadcaster* role. Broadcasters are approved immediately; only CMO
   accounts wait for verification (they can read the whole catalogue).
2. **Dashboard → Station & Stream.** Two options:
   - **This station is already listed** — pick from the unclaimed stations in the panel (name, frequency,
     region and radio/TV only; no stream URLs, no playout data).
   - **Add a new station** — name, optional frequency, region, radio/TV, and the stream URL. The form previews
     the panel id (`next-radio-106-1`) using the same slug rule the approval function applies.
3. **Submit.** The request lands in `station_requests` with `status = 'pending'`. The broadcaster sees it in
   *Your requests* and can cancel while it is pending.
4. **CMO reviews** in *CMO dashboard → Station Requests*: **Approve** links the station to the requesting
   organisation (or creates it with the supplied URL); **Reject** records that a human said no.
5. **Monitoring starts.** An approved station appears on the broadcaster's dashboard with the monitor's real
   status: `online`, `reconnecting`, `no_stream_url`, or `disabled`. Nothing is assumed — if the URL is wrong,
   the dashboard says so instead of showing an empty chart.

## What the approver is deciding

Linking an organisation to a station decides **whose playout data that organisation can read**. Two rules keep
that honest:

- `stations.broadcaster_org_id` is what every broadcaster RLS policy keys on, so a wrong link exposes someone
  else's playout to the wrong company;
- only a `cmo` role can call `approve_station_request()` / `reject_station_request()` — verified in the database,
  not just hidden in the UI. A broadcaster calling the function gets
  `only a CMO can approve a station request`.

Station claims are also a **rights conversation**: the broadcaster should know their signal is fingerprinted,
and should be on a Broadcaster plan. Approval is the natural moment to have it.

## What the database enforces

| Rule | Where |
| --- | --- |
| A person can only create their own request, and only as `pending` | `station_requests_own_insert` |
| A person can read their own requests; a CMO reads all | `station_requests_read` |
| A person can only cancel their own request | `station_requests_own_cancel` |
| Only a CMO can approve/reject | `my_role()` check inside both functions |
| A claim must name a station *or* a real station name | `station_request_target` |
| Stream URLs are http(s) only, never `file:`, `pipe:` or loopback | `lib/station-request.ts` (client) |
| Slugs stay unique when a new station is created | `on conflict (slug) do update` in the approval function |

The stream-URL rule matters: the worker hands that URL to ffmpeg, so a `file://` URL would be a way to read the
monitoring box's own filesystem. The client rejects it; the approval step is where a human also looks.

## Current production state (10 Nov 2026)

- **Next Radio** — broadcaster account linked to the *Next Radio* station (106.1, Central), which the monitor
  already reports as `online`. Their dashboard is populated as soon as music is fingerprinted.
- **Next Radio (CMO)** — approved, so the national audit view is open.
- 25 stations remain unclaimed and available to claim from the broadcaster dashboard.

## Tests

- `tests/station-request.test.ts` (12) — slug parity with SQL, unsafe URL rejection, claim/new validation,
  type defaulting, note limits.
- `tests/station-setup.test.tsx` (6) — the blocked state explains itself, only unclaimed stations are listed,
  claim and new-station submissions, request history with pending-only cancel, server errors surfaced.
- Live RLS probe in production: broadcaster insert allowed → CMO approve linked the station → broadcaster
  approve rejected with `P0001`.
