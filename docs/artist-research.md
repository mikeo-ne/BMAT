# Artist research: BARANGA, MR FALLBACK, SOUNDLYKBB and TAI DAI

**Reviewed:** 1 November 2026. **Scope:** a curated public-release selection, not a complete discography, a rights registry, or measured airplay.

The implementation lives in `lib/artist-library.ts`, is available at `/dashboard/artists` and in the Artist Portal’s **Artists & music** tab, and is exposed read-only through `GET /api/artists`.

## Matched artist identities

| Requested name | Matched platform identity                                  | Catalogue-based profile                                                                                                         |
| -------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| BARANGA        | <https://music.apple.com/ug/artist/baranga/1764683984>     | Releases include **SALO** (2024) and **CHAPTERS I NEVER WROTE** (2026). The album credits MR FALLBACK on BREATHE and WAGWUAN.   |
| MR FALLBACK    | <https://music.apple.com/ug/artist/mr-fallback/1795137555> | Solo catalogue includes **Ekibobo** and **Abeyoo (feat. Sopreno C)**. The artist profile also links the Baranga collaborations. |
| SOUNDLYKBB     | <https://music.apple.com/ug/artist/soundlykbb/1690023792>  | Releases include **MADE IN ENTEBBE**, **OLA MUMMY**, and joint releases **Thursday** and **Sponsor**.                           |
| TAI DAI        | <https://music.apple.com/ug/artist/tai-dai/1426402603>     | Releases include **Outside Shoes**, **UNFORGETTABLE** and **WHET**, plus the joint recording **Thursday**.                      |

Profiles in the app are original short summaries of these cited catalogues. Unverified ages, legal names, hometowns, awards, streaming totals and label affiliations have not been invented. Similarly named artists, including the mixed Brazilian-rock Baranga search results and Philly Fallback, were not imported.

## Selected recordings

The source column links the exact album/single edition used for the release date, duration, genre and published phonogram credit. The application also retains the individual track’s Apple Music URL and platform ID, which are **not ISRCs**.

| Recording                                  | Primary / joint credits            | Featured credits          | Release date | Full duration | Edition source                                                             |
| ------------------------------------------ | ---------------------------------- | ------------------------- | ------------ | ------------- | -------------------------------------------------------------------------- |
| SALO                                       | Baranga                            | —                         | 2024-08-24   | 2:34          | <https://music.apple.com/ug/album/salo-single/1764794748>                  |
| BREATHE (feat. MR FALLBACK)                | Baranga                            | MR FALLBACK               | 2026-05-08   | 3:16          | <https://music.apple.com/ug/album/chapters-i-never-wrote/6768973076>       |
| WAGWUAN (feat. MR FALLBACK & MELLAN KUNTA) | Baranga                            | MR FALLBACK; MELLAN KUNTA | 2026-05-08   | 3:12          | <https://music.apple.com/ug/album/chapters-i-never-wrote/6768973076>       |
| Ekibobo                                    | Mr fallback                        | —                         | 2025-03-04   | 2:41          | <https://music.apple.com/ug/album/ekibobo-single/1800333010>               |
| Abeyoo (feat. Sopreno C)                   | Mr fallback                        | Sopreno C                 | 2026-03-13   | 2:16          | <https://music.apple.com/ug/album/abeyoo-feat-sopreno-c-single/1885183494> |
| Sponsor                                    | Denim Cartel; Soundlykbb; Big Tril | —                         | 2026-10-21   | 3:31          | <https://music.apple.com/ug/album/sponsor-single/6817897466>               |
| OLA MUMMY                                  | Soundlykbb                         | —                         | 2025-01-17   | 2:59          | <https://music.apple.com/ug/album/ola-mummy-single/1788711313>             |
| BUNDA FREESTYLE                            | Soundlykbb; Khxli                  | —                         | 2023-06-02   | 2:38          | <https://music.apple.com/ug/album/made-in-entebbe-ep/1690048888>           |
| Outside Shoes                              | Tai Dai                            | —                         | 2025-05-01   | 2:47          | <https://music.apple.com/ug/album/outside-shoes-single/1805030740>         |
| GRANTED                                    | Tai Dai; Lukorito                  | —                         | 2026-07-23   | 2:24          | <https://music.apple.com/ug/album/whet-ep/6782961962>                      |
| UNFORGETTABLE                              | Tai Dai                            | —                         | 2026-06-05   | 1:50          | <https://music.apple.com/ug/album/unforgettable-single/6768396763>         |
| Thursday                                   | Kaboo; Tai Dai; Soundlykbb         | —                         | 2024-01-18   | 3:16          | <https://music.apple.com/ug/album/thursday-single/1814799669>              |

### Edition and credit decisions

- **Ekibobo:** the original 4 March 2025 edition (`1800333010`, track `1800333011`) is selected. Apple also lists a 5 March edition (`1800514270`); these have not been merged or double-counted.
- **UNFORGETTABLE:** the 5 June 2026 single is selected, not its later WHET listing. No assumption is made that different listings share an ISRC.
- **Thursday, Sponsor, BUNDA FREESTYLE and GRANTED:** track-level joint artist credits are preserved. Additional primary artists are not silently relabelled as features.
- **Collaborations:** BREATHE and WAGWUAN appear in both relevant artist filters, and Thursday appears under both SOUNDLYKBB and TAI DAI, but each recording is stored only once.
- Published **℗ credits are attribution**, not verification that a particular artist owns 100% or that East Sound has permission to reproduce a master.

## How the music is used

1. Real release metadata and provenance are bundled with the app; there is no runtime scraping or external metadata API key.
2. **Listen** opens a native modal. No third-party iframe loads until the user selects **Load Apple Music player**.
3. The allowlisted embed URL uses the original track and album identifiers and does not request autoplay. The direct Apple Music link remains available if the embed is blocked.
4. Playback, previews, subscriptions, sign-in, regional restrictions and content warnings remain controlled by Apple Music. Listed durations describe the full release, not the available preview.
5. Closing the modal unmounts the iframe. No song is downloaded, proxied, cached, self-hosted or added to a reference fingerprint index by this feature.
6. A scoped CSV export contains **metadata and source links, not audio**.

The external provider’s actual playback must be checked from a browser that can reach Apple Music; the development sandbox’s outbound network is restricted. Local tests can verify consent, correct embed construction, fallback links, filters, exports and player cleanup without claiming to have verified a full streamed song.

## Rights and analytics boundaries

The twelve sourced recordings now form the production catalogue seed and replace the old asset-less fictional artist/track fixtures. The active catalogue retains the exact public edition and co-credit metadata, but does not infer masters, identifiers, ownership, observed plays or royalties. An idempotent legacy migration preserves genuinely stored masters and unrelated deliveries.

- `isrc` remains `null` in the research registry and empty in a catalogue reference until supplied by an authoritative source or rights holder.
- Actual artists’ public metadata is separate from test-only generic broadcast/rights fixtures. The dashboard uses an initially empty captured-event store; captured events require an authenticated integration and do not establish independent provenance merely by ingestion.
- A ten-second evidence player is available only when a real captured excerpt reference is supplied. No generated tone is substituted for an actual capture; tests may use explicitly isolated QA audio.
- There is no implied artist endorsement, label affiliation, licence, registration or grant of master rights.
- To ingest/fingerprint an actual recording, supply a WAV/MP3 master you own or are authorised to use, its existing verified ISRC where applicable, and approved collaborator splits. Public streaming availability is not that permission.

`tests/artist-library.test.ts`, `tests/artist-library-ui.test.tsx` and the capture/notification tests protect provenance, unique recordings, co-lead credits, reference-only status, unknown identifiers/rights, migration safety, CSV scope, embed allowlisting and explicit player consent. See [integration contracts](notifications-and-capture.md) for capture and notification setup.
