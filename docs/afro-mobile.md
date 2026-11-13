# AfroMobile (MTN TV): what it tracks, and what we can use it for

_Researched 11 November 2026._

## The short answer

AfroMobile **carries** stations; it does not **track airplay**. It knows how many people watched NBS TV at 21:00.
It does not know which song played at 14:32, who wrote it, or what to pay them. So there is no "airplay data" inside
AfroMobile to plug into — what we want from them is the **channel list, the EPG and permission to monitor**, not a
royalty feed.

| | AfroMobile / MTN TV | East Sound |
| --- | --- | --- |
| What it is | OTT distributor (app, subscriptions, CDN) | Airplay detection + evidence + paperwork |
| Scale (latest) | **60+ live TV channels, 53 radio stations** (MTN TV launch, 7 Aug 2026) | 28 radio stations in the panel, 0 TV yet |
| Revenue | Subscription bundles (UGX 4,000/week with MTN data) | Nothing yet — early access is free |
| Measures | Streams, watch time, concurrency, app analytics | Per-play: recording, station, timestamp, 10-second clip, ISRC/credits |
| Output | Viewer numbers | Cue sheets, charts, disputes, splits, CMO distribution pack |
| Legal basis | Rights deals with each broadcaster | Monitoring of broadcast output; needs the broadcaster's consent |

## How they do it

1. **Each broadcaster hands over a feed** — either its own HLS/RTMP encoder output or an OTT feed the broadcaster
   already runs (this is why their radio list and our FM panel overlap: Sanyu FM, Nxt Radio, Galaxy FM, Akaboozi,
   Radio 4, Radio Simba, Open Gate, Radio Pacis).
2. **AfroMobile transcodes and packages** to HLS/DASH behind a CDN edge, typically in-region.
3. **The app gates access**: subscription or MTN bundle, session token per stream. Paid since August 2022.
4. **Analytics are client-side**: a play starts, a session is counted, watch time is accumulated. Nothing inspects
   the audio.

Their numbers over time: 11 TV / 25 radio at the January 2021 launch, 30+ TV / 50+ radio by 2022–2024, and
**60+ TV / 53 radio** at the MTN TV relaunch on 7 August 2026.

## What we can and cannot take from it

**Cannot (and will not):** pull their subscriber streams. They are token-gated and paid; capturing them means
bypassing a paywall and their terms, and it would poison exactly the broadcaster relationships we need for cue
sheets. Our own rule in `docs/tv-ingest.md` already says: no scraping, no invented URLs.

**Can, three ways — in the order I would do them:**

| Route | What it gives us | Effort | Blocked on |
| --- | --- | --- | --- |
| **1. Monitor the broadcasters' own OTT feeds** (the same channels AfroMobile carries, but the public/free-to-air HLS each broadcaster publishes) | TV detections this week: NBS, Bukedde, UBC, Sanyuka, Salt, Top TV… | Panel code already supports `kind='tv'`; we only need verified URLs | One URL per channel from the broadcaster (or their web player's manifest) |
| **2. Data partnership with AfroMobile / Next Media** | Channel list, EPG, playout/now-playing metadata, and written permission to monitor | A meeting + a one-page agreement | An introduction; the ask below |
| **3. DVB-T2 capture in Kampala** | The authoritative free-to-air signal: every channel on the multiplex, unblockable by geo-IP, no ToS problem | One tuner + a small PC in a Kampala colo, ~UGX 1.5–3M capex, ~UGX 300k/month | Hosting and someone to rack it |

Route 3 is what serious monitoring outfits do, and it is the long-term answer for TV. Route 1 proves the product
before we spend that money.

### The ask to AfroMobile / Next Media

> You distribute 60+ TV and 53 radio stations. You can tell a broadcaster how many people watched; you cannot tell
> them which songs played, or produce the cue sheet UPRS asks for. We do exactly that, per play, with a 10-second
> clip as evidence.
>
> We are asking for three things, none of which touch your subscribers: (1) your channel and station list with
> logos and EPG; (2) any playout metadata you already hold (now-playing, schedule); (3) written permission to
> fingerprint the feeds in a private, non-public instance. In return, every broadcaster on your platform gets a
> verified airplay report they can take to UPRS, and you get a data product to sell alongside distribution.

## The lesson we should apply to ourselves

On 11 November the worker was heartbeating while 25 stations reconnected and reported
`Error opening input files: Option not found`. The cause was FFmpeg output options applied
before the input, not an established geographic block. The command has since been corrected.
A later production check found **25 stations online with fresh heartbeats** on Railway EU West;
that is evidence that audio is being read, not proof of a song match. The same check found
zero matched detections, despite recent unmatched clips and recordings marked enrolled.
The live index and matching pipeline still need an end-to-end, authorised-play verification.

Do not move the worker solely on the old region theory. If specific feeds fail, investigate
their individual errors and test reachability from the proposed host before considering a move.

## Concrete next steps

1. Verify a known enrolled, authorised recording can be detected when actually broadcast;
   investigate unmatched clips, the worker index and matching thresholds if it does not.
2. Collect verified HLS URLs for TV channels and permission from the broadcasters; insert
   the approved rows with `kind='tv'`. Do not treat a prospective channel as confirmed coverage.
3. Approach AfroMobile / Next Media for channel lists, EPG and permission to monitor.
4. Evaluate DVB-T2 capture, including permissions and costs, when TV volume justifies it.
