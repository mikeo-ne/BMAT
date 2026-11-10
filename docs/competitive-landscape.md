# Competitive landscape — East Sound vs. the airplay market

_Written 5 November 2026. Sources are linked at the bottom; pricing and coverage
figures move, so treat the numbers as of that date._

## Why this matters now

Uganda is the only market in the region where a **national monitoring system is
being built by the state**: the Ministry of Justice plans a digital copyright
management system (devices in bars, radio and TV stations) to roll out by
December 2026, and the Copyright and Neighbouring Rights (Amendment) Act 2026
expanded enforcement powers. Broadcasters already agreed with UPRS in 2021 to
pay for airplay. The technology question is settled; the open question is
**who supplies the evidence** — a government system, a foreign service, or a
local platform that stations, labels and the CMO already trust.

That is the competitive window.

## Who we are actually up against

### 1. SongBoost — the direct one, and Ugandan

A mobile app tracking radio/TV airplay across 8–10 African countries, marketed
as "229 stations" in Uganda/Kenya/Rwanda/Tanzania/Nigeria, with instant play
notifications, per-station ranking, a public Top 100 and a "song focus mode".
**$10/month per month or ~UGX 35,000, paid by mobile money.**

- **Wins on:** price clarity, a phone-first product, self-serve onboarding,
  public charts, and mindshare with artists.
- **Thin on:** no evidence clips, no royalty statements or splits, no dispute
  workflow, no CMO tooling, no venue monitoring, no cue sheets, no API/export
  story beyond reports, and no relationship with the CMO's distribution process.
- **Lesson for us:** they sell *one* thing cheaply to artists. We sell the whole
  chain to rights holders *and* broadcasters.

### 2. Radiomonitor — the global incumbent with African coverage

120+ countries, **400+ African stations** (190+ in South Africa, 100+ Nigeria),
200+ stations in South Africa alone, charts that power official charts (RiSA),
mobile app, email reports and **custom data feeds**, plus an Audlytics
partnership (ALM) that turns airplay logs + usage rates into royalty reports
"specifically designed for African CMOs".

- **Wins on:** coverage, credibility, cross-border reciprocal claims, audience
  reach/impressions (RAMS), and a ready royalty-reporting layer for CMOs.
- **Thin on:** priced for labels and societies, no venue monitoring, no evidence
  audio for the artist, no dispute/split resolution, no local-language support,
  and its data leaves the country — a hard sell against a state-owned system.
- **Lesson for us:** the CMO is the highest-value buyer, and what they need is
  *distribution-ready* output, not dashboards.

### 3. GoCreate Africa (Go Monitor) — the CMO-first rival

Nigerian company providing music-recognition monitoring to CMOs: deployed with
MCSN (Nigeria) and launched in Ghana with MUSIGA; covers radio/TV airplay, DSP
reporting, **and offline venue monitoring** (events, nightclubs, hotels), bundled
with a distribution product.

- **Wins on:** CMO deployments, venue monitoring, one-stop story.
- **Thin on:** no public product for artists/broadcasters, no evidence clips
  surfaced to rights holders, no dispute tooling.

### 4. BMAT Music Innovators — the infrastructure player

The company whose name this repo used to carry: fingerprinting and streaming/
broadcast data used to compile official charts (e.g. the South African charts
alongside Radiomonitor). Enterprise, invisible, API/feed-shaped.

### 5. Global analytics — Soundcharts, Songstats, Chartmetric, Viberate

Radio is a *feature* for them: Soundcharts 2,400+ stations, Songstats/Radiostats
claims 50,000+ via AI, Chartmetric ~2,300. $10–$140/month, artist-facing,
built for promotion decisions.

- **Wins on:** price, breadth, self-serve, mobile experience.
- **Irrelevant for us on:** royalties, CMO distribution, evidence, disputes,
  local broadcast relationships. They are a *marketing* tool; we are an
  *accounting* tool.

### 6. Nielsen/BDS, Music Reports, Mediabase

US-centric broadcast measurement and licensing administration. Not in this
market; useful only as a template for report formats.

## Feature matrix

| Capability | East Sound | SongBoost | Radiomonitor | GoCreate | Soundcharts/Songstats |
| --- | --- | --- | --- | --- | --- |
| Radio fingerprinting | ✅ 29 stations, 4 regions | ✅ ~229 claimed | ✅ 400+ Africa | ✅ | ✅ |
| TV monitoring | ❌ | ✅ | ✅ | ✅ | ➖ |
| Venue monitoring | ✅ nodes + DJ sets | ❌ | ❌ | ✅ | ❌ |
| **10-second evidence clip per play** | ✅ | ❌ | ❌ | ❌ | ❌ |
| WhatsApp alerts | ✅ | push only | app/email | ❌ | push/email |
| Royalty statements & splits | ✅ | ❌ | via ALM partner | partial | ❌ |
| Dispute resolution workflow | ✅ | ❌ | ❌ | ❌ | ❌ |
| UPRS cue sheets (PDF/Excel) | ✅ | ❌ | ➖ | ➖ | ❌ |
| Public national chart | ✅ (warming up) | ✅ | ✅ (published) | ❌ | ➖ |
| **CSV data export (this release)** | ✅ | ➖ | ✅ feeds | ➖ | ✅ |
| API / data feed | ❌ (planned) | ❌ | ✅ | partial | ✅ |
| Mobile app | ❌ (web-first) | ✅ | ✅ | ❌ | ✅ |
| Audience reach / impressions | ❌ | ❌ | ✅ RAMS | ❌ | partial |
| Cross-border reciprocity | ❌ (Uganda) | partial | ✅ 120 countries | ✅ 2 countries | ✅ |
| Local languages | ✅ EN/LG/SW | English | English | English | English |
| Self-serve mobile-money billing | ❌ | ✅ | ❌ | ❌ | ✅ |

Legend: ✅ present · ➖ partial/partner · ❌ absent.

## Where we actually win

1. **Evidence, not just numbers.** Every detection can carry a playable 10-second
   clip. In a dispute — the exact situation that stops royalty payments in
   Uganda — "here is the audio" beats "trust our count". No competitor surfaces
   this to the rights holder.
2. **The whole chain in one system.** Monitor → match → split → dispute → statement
   → cue sheet. SongBoost stops at "your song played"; Radiomonitor stops at
   "here is the report"; we go to "here is what you are owed, and here is why".
3. **Venues + radio together.** GoCreate does venues, Radiomonitor does not.
   Uganda's 2026 law targets bars and public spaces as much as stations.
4. **Local language + WhatsApp.** Our notification channel is the one every
   Ugandan rights holder actually uses — no app install, no data plan in USD.
5. **Sovereign-by-default.** Self-hosted, data stays in-country — a straight
   contrast to a foreign feed when the state is building its own system.

## Where we are exposed (and what to do)

| Gap | Risk | Priority | Effort |
| --- | --- | --- | --- |
| **TV monitoring** | Radiomonitor/SongBoost cover TV; advertisers buy TV proof-of-play | P1 | High (new ingest) |
| **CMO-ready royalty output** | Radiomonitor + ALM is packaging exactly this for African CMOs | P0 | Medium |
| **Data feeds / API** | Enterprise buyers expect machine-readable access | P0 | Medium (CSV shipped; then read-only API) |
| **Mobile experience** | SongBoost's whole pitch is "it's in your pocket" | P1 | Medium (PWA first) |
| **Audience reach (RAMS-like)** | Chart credibility and ad pricing depend on reach | P2 | High (needs survey/panel data) |
| **Cross-border coverage** | Regional labels want Kenya/Tanzania/Rwanda | P2 | High (partnership or expansion) |
| **Self-serve billing (MoMo)** | Revenue; SongBoost proves the price point | P1 | Medium |
| **Public chart publishing partner** | Charts become newsworthy only with a media partner | P2 | Low (BD, not code) |

## Roadmap this implies

**P0 — distribution-ready data (do first, cheap):** *shipped*
- CSV export on every table — catalogue, roster, registry, Top 100 (cue sheets
  already had PDF/Excel).
- Read-only feed — `GET /api/feed/airplay`, JSON or CSV, bearer token, RLS
  decides rows. See `docs/cmo-data-feed.md`.
- Monthly per-station report — the **CMO Monthly Distribution Pack**: PDF with
  per-station plays/works/artists/evidence share plus top works, a matching CSV,
  and the same month served by the feed. Backed by
  `station_month_report()` + `month_top_works()` (SECURITY INVOKER).
- Still open in P0: an evidence index inside the PDF (clip links per detection)
  and the unpaid/outstanding column, which need royalty statements to be live.

**P1 — close the visible gaps:** *capability shipped, activation pending*
- **TV ingest** — `stations.kind = radio | tv`, HLS live-edge capture in the
  worker, `source: "tv"` detections, radio/TV split on `/coverage`
  (`docs/tv-ingest.md`). No channel is monitored yet: NBS, Bukedde and UBC need
  an official HLS endpoint and a monitoring agreement before a row goes in.
- **Installable PWA + push** — manifest, generated icons, service worker,
  offline page, install prompt; push subscriptions in `push_subscriptions` and a
  VAPID-gated sender (`docs/pwa-and-push.md`). Alert *rules* still reach email
  and WhatsApp, not push, until the outbox sender is extended.
- **Self-serve plans** — `/pricing` in shillings (artist UGX 35,000), mobile-money
  request flow with a quotable reference, CMO request list (`docs/billing.md`).
  No money moves: a collection account is the remaining step.

**P2 — moat:** *metric shipped, data pending*
- **Reach/impressions** — AQH-based estimate with the caveat attached and a
  published methodology (`docs/reach-methodology.md`). Production shows "no
  station has supplied an audience figure yet" until broadcasters hand theirs
  over; that is the designed state, not a gap to paper over.
- Regional expansion via partners (Kenya, Rwanda, Tanzania) rather than build-out.
- Publish the national chart with a media partner; tie it to UPRS distribution.

## The three tiers, and the one line that answers each

A rival brief circulating in November 2026 (the "BMAT in East Africa" notebook)
sorted the market into three tiers. It is a useful frame because each tier loses
to us for a *different* reason, so each one gets a different sentence — not one
generic "we are better" claim.

| Tier | Who | Their real strength | Where they lose to us | Our line |
| --- | --- | --- | --- | --- |
| **Global enterprise** | BMAT (Spain), Audible Magic (US), ACRCloud (China) | Reference-grade fingerprinting, enterprise SLAs, deals with big CMOs and platforms | Priced for enterprise, sold as an API/engine, no Ugandan cue sheets, no venue licensing workflow, no Luganda/WhatsApp support, data hosted abroad | "Same class of audio matching. Ugandan paperwork, Ugandan prices, Ugandan stations." |
| **Regional / pan-African** | Radiomonitor (South Africa/Nigeria, charts for Sony/UMG/WMG), SongBoost, GoCreate | Charts and reports labels trust, mobile-first onboarding, CMO relationships elsewhere | Coverage concentrates on a handful of big-city stations; a country-in-a-spreadsheet mindset; little/no evidence per play | "They cover Africa. We cover *your* region, station by station, and we can play you the clip." |
| **Legacy manual** | Handwritten radio log sheets, paper cue sheets, UPRS field agents | Free at the point of use, already in everyone's workflow, no onboarding | Days-to-weeks delay, unverifiable, misses upcountry stations, expensive to audit | "A log sheet is a promise. A 10-second clip is proof." |

Two corrections to keep the brief honest:

- **"Wavsatch / RadioMonitor" is Radiomonitor.** One company, an established
  South African monitoring firm; not a Ugandan startup.
- **Mdundo and Boomplay are not competitors.** They report *streams*. East
  Sound reports *terrestrial broadcast* (radio now, TV next) and venues. The
  honest framing — and the useful product framing — is integration: a rights
  holder wants streams and spins side by side, and we are happy to be the
  broadcast half of that picture.

### What shipped because of this brief

- **`/coverage`** (new public page, linked from the header, homepage and
  sitemap): per-region station counts straight from the monitoring panel, with
  the four-region argument, the evidence argument and a manual-logs-vs-us table.
  Numbers come from a `public_coverage()` RPC that returns counts only — no
  station names, no stream URLs — and the page labels sample data as sample.
- **`docs/competitive-landscape.md`** (this file) now carries the tier table so
  sales copy and product decisions point at the same target.
- Existing: CSV export on every table a rights holder sees (see PR #41), which
  is the direct answer to "a PDF report from a foreign service".

### What the tier table says to build next

1. **Against global enterprise:** an evidence-first audit trail (clip +
   timestamp + confidence + station licence) that a CMO can file. Most of the
   data already exists; the missing piece is a one-click *statement pack*.
2. **Against regional tools:** deepen regional density where they are thin —
   Northern and Western Uganda first, since a 1-station region is the weakest
   line on the coverage page.
3. **Against manual logs:** a broadcaster-facing "replace your log sheet" flow
   — auto-generated cue sheets per station per month, which doubles as the UPRS
   filing.


## Positioning sentence

> East Sound is the only airplay platform that proves every play with audio,
> prices in shillings, speaks Luganda, and closes the loop from detection to a
> royalty statement — for rights holders, broadcasters and the CMO, in one system.

Short form for the site and pitch deck (**The Hyper-Local, Affordable Standard
for East Africa**): density across all four Ugandan regions, UPRS compliance
built in, and a 10-second audible clip behind every number.

## Sources

- Radiomonitor coverage and African partnerships — <https://grokipedia.com/page/radiomonitor>, <https://audlytics.lovable.app/radiomonitor>
- Official South African Charts (Radiomonitor radio + BMAT streaming) — <https://theofficialsacharts.co.za/about/>
- SongBoost coverage, price and features — <https://songboost.app/musicians-managers-how-to-track-your-radio-airplay-across-africa/>, <https://play.google.com/store/apps/details?id=app.songboost>
- GoCreate Africa / Go Monitor with MCSN and MUSIGA — <https://allafrica.com/stories/202112310132.html>
- Uganda's national CMS plan and the 2026 Copyright Amendment — <https://www.sqoop.co.ug/202606/features/why-the-copyright-management-system-may-be-solving-the-wrong-problem.html>, <https://nymynet.com/uganda-copyright-law-2026-explained-what-it-fixes-misses-and-overlooks-part-1/>
- 2021 UPRS / broadcaster royalty agreement — <https://recordradio.co.ug/radio-and-tv-stations-commit-to-pay-artists-for-using-their-music/>
- Global analytics pricing and radio coverage — <https://orphiq.com/resources/music-analytics-platforms-compared>, <https://resources.onestowatch.com/best-music-analytics-platforms-2026/>
