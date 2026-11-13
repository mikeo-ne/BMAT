# Music API assessment and stream verification

This is a research snapshot, not an integration or a production licence approval. East Sound
must continue to support uploads and manual editing of multiple songwriters and featured artists.
None of these services provides proof of rights ownership or radio/TV airplay.

## Stream status and regression

The earlier FFmpeg `Option not found` issue was already fixed in the current main branch:
`stream_command` now puts `-vn`, `-ac` and `-ar` **after** `-i`. A real HTTP MP3 fixture
reproduces the old ordering failure (`Option sample_rate not found`); the corrected command
decodes it. The regression suite also decodes an HTTP HLS fixture and runs against the actual
worker Docker image in CI. These finite synthetic fixtures do not prove live-stream reliability.

A production database check returned 25 fresh online stations, no fresh reconnecting stations,
11 recordings with masters marked enrolled, 2,963 unmatched clips and **zero matched detections**.
A heartbeat marked online is sent after audio was read; it does not prove that the correct audio
was identified. A database enrollment flag does not independently prove the worker's local index
contains each recording. Check again at the time of use; these counts are not live. Verify an
actual authorised broadcast of an enrolled track, then inspect the worker's index and matching
thresholds if no detection results. Do not play a recording on air without broadcaster permission.

## MusicBrainz: small ISRC lookup experiment

Eight public, independently listed examples were selected by title, artist and ISRC from the
linked music catalogues. Each ISRC was looked up using MusicBrainz's `ws/2/isrc/{ISRC}` with
`inc=artist-credits&fmt=json`. A match here requires the reported recording title/version and
named artist(s) to agree with the independent listing; it is not an ownership verification.
A `Not Found` below means MusicBrainz returned its `Not Found` response, not a network error.
The sample is convenient, non-random, very small and biased toward artists with public ISRCs:
it **does not establish overall Ugandan catalogue coverage**. Only Azawi, Eddy Kenzo, Vinka,
Fik Fameica and collaborators are represented. MusicBrainz results may change over time.

| Independent reference | ISRC | MusicBrainz result | Assessment |
| --- | --- | --- | --- |
| [Eddy Kenzo – Sitya Loss](https://songdata.io/track/5a39V8NZADQeq7yxRJ8H7l/Sitya-Loss-by-Eddy-Kenzo) | TCABX1420107 | [Not Found](https://musicbrainz.org/ws/2/isrc/TCABX1420107?inc=artist-credits&fmt=json) | No result |
| [Eddy Kenzo – Nze Nsinga](https://meows.app/song/de/TCABX1420599) | TCABX1420599 | [Not Found](https://musicbrainz.org/ws/2/isrc/TCABX1420599?inc=artist-credits&fmt=json) | No result |
| [Azawi – Slow Dancing](https://musicstax.com/track/slow-dancing/2mugl8epqHUCjmVPJJYqBl) | UGA2F2100082 | [Slow Dancing — Azawi](https://musicbrainz.org/ws/2/isrc/UGA2F2100082?inc=artist-credits&fmt=json) | Match; MusicBrainz first release date differs from the independent album date |
| [Azawi & ZedBoy – Slow Dancing (Zedboy Remix)](https://soundcharts.com/fr/song/97fde5f2-d909-45a2-a270-005eaee784ed) | UGA2F2100111 | [Slow Dancing - ZedBoy Remix — Azawi & ZedBoy](https://musicbrainz.org/ws/2/isrc/UGA2F2100111?inc=artist-credits&fmt=json) | Title/version and artists match; displayed release dates differ |
| [Vinka et al. – Amaaso (Urban Remix)](https://soundcharts.com/en/song/44996f50-f7de-11e9-be4d-e4434b2a4898) | TCAEM1910613 | [Amaaso - Urban Remix — Vinka, Winnie Nwagi, The Mith, Feffe Bussi & DJ Harold](https://musicbrainz.org/ws/2/isrc/TCAEM1910613?inc=artist-credits&fmt=json) | Match (artist order differs) |
| [Gravity Omutujju & Karole Kasita – Tetunazina](https://soundcharts.com/en/song/886adb8f-eb0b-4b6a-9bb3-8d0e230f2aec) | QZHN52300570 | [Not Found](https://musicbrainz.org/ws/2/isrc/QZHN52300570?inc=artist-credits&fmt=json) | No result |
| [Fik Fameica & Liam Voice – Biggwa](https://soundcharts.com/en/song/a9ab6c53-cb92-44ef-b813-036ce3764af8) | QZTAT2546707 | [Not Found](https://musicbrainz.org/ws/2/isrc/QZTAT2546707?inc=artist-credits&fmt=json) | No result |
| [Fik Fameica – Mbega Wa Baala](https://musicstax.com/track/mbega-wa-baala/0yQCz7ow2QxF5zsMkUK67q) | TCADL1896576 | [Not Found](https://musicbrainz.org/ws/2/isrc/TCADL1896576?inc=artist-credits&fmt=json) | No result |

**Result: 3/8 had matching title/version and artists; 5/8 returned Not Found.** No mismatching
recordings were returned in this sample. These are third-party ISRC listings, not a rights-holder
certification. No credits or recording data were written into East Sound. First-release dates
and album release dates may refer to different events; do not silently overwrite either.

Before any integration, confirm commercial hosted-service terms with MetaBrainz. Their
[API FAQ](https://musicbrainz.org/doc/MusicBrainz_API) says non-commercial use is free and
commercial use requires contacting them or a commercial plan. Provide a meaningful user agent,
respect the [rate limit](https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting) and cache
only as permitted. Core and supplemental data have different [licences](https://musicbrainz.org/doc/MusicBrainz_Database);
artwork is separate. If approved, present candidate metadata for user review, preserve manual
input and all writers/features, and never use it to overwrite ownership claims or fingerprint audio.

## Audiomack: official API feasibility

[Official Data API documentation](https://audiomack.com/data-api/docs) describes HTTPS, JSON,
OAuth **1.0a** (not OAuth 2.0), `GET /v1/music/:id`,
`GET /v1/music/(song|album)/(artist slug)/(song or album slug)`, artist uploads, and search.
The example music entity includes title, artist, featuring, album, producer and artwork. The
example does **not** establish that ISRCs or songwriter splits are available; confirm with the
provider. The docs show short-lived streaming URLs, but obtaining a stream does not grant rights
to download it, create fingerprints, or use it as a master. Audiomack metrics are platform
activity, not radio detections.

`lib/links/resolve.ts` already reads Audiomack page metadata; that is not an official API
integration. This assessment did not call authenticated endpoints, request access, add credentials,
or verify production availability, quota, price, artwork rights, caching, or commercial terms.

**Proposed onboarding only after written approval:**

1. Ask Audiomack for developer access and confirm commercial uses, exact fields (including ISRC,
   credits and track lists), rate limits, caching/attribution, and whether uploads require user
   authorisation. Request sample data, not end-user credentials.
2. Resolve a user-supplied Audiomack song or album link server-side with signed requests. For
   any user-authorised access, use the documented OAuth 1.0a flow; store secrets only server-side.
3. Show editable candidate title, artist, features and album with source attribution; handle
   ambiguous names and partial results. Never infer identity, ownership or writer splits.
4. Ask the rights holder to upload or provide an authorised master separately; an Audiomack
   catalogue record alone cannot enroll a fingerprint. Test with mocks first and a small
   consented Uganda catalogue after approval; preserve the existing manual path.

## YouTube later

YouTube statistics are out of scope for this work. If added later, keep platform views and
broadcast airplay in separate labelled fields and reports, and review API quotas, attribution,
retention and access terms first. They must never enter CMO cue sheets as station plays.
