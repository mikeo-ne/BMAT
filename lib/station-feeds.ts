/**
 * Real broadcast station feed registry for East Sound.
 *
 * Unlike the illustrative FM panel fixture in `lib/regions.ts`, every entry
 * below carries a real, publicly reachable stream URL collected from public
 * radio/TV stream directories:
 *
 *  - Radio (FM/AM) streams: RadioBrowser public API (radio-browser.info),
 *    which aggregates station-reported Icecast/Shoutcast/HTTP audio feeds.
 *  - TV streams: the iptv-org public playlist catalog (github.com/iptv-org),
 *    which mirrors broadcaster HLS/DASH endpoints.
 *  - Reference feed: BBC World Service (English/Africa), verified live.
 *
 * `verified` marks streams whose URL was confirmed reachable with a live
 * playlist/audio probe at registry time. The `/api/station-health` probe
 * re-checks every feed at runtime, so this flag is a best-effort seed only —
 * never present it as a licence record or an official source confirmation.
 *
 * Stream URLs change without notice (broadcasters rotate CDNs). The probe
 * keeps the displayed health honest; when a feed dies, mark it `retired`
 * here rather than deleting it so history stays auditable.
 */

export type FeedCountry = "UG" | "KE" | "TZ" | "RW";

export const FEED_COUNTRIES: readonly FeedCountry[] = ["UG", "KE", "TZ", "RW"];

export type FeedMedium = "FM" | "TV";

export type FeedSource = "RadioBrowser" | "iptv-org" | "BBC";

export interface StationFeed {
  /** Stable registry id, e.g. "ntv-uganda". */
  id: string;
  name: string;
  country: FeedCountry;
  city: string;
  medium: FeedMedium;
  /** Transmitting frequency for radio (e.g. "101.8"); "TV" for TV channels. */
  frequency: string;
  /** Public stream URL probed by the health service. */
  streamUrl: string;
  homepage: string;
  /** Where the stream URL was collected from. */
  source: FeedSource;
  /** URL confirmed reachable at registry time (best-effort seed). */
  verified: boolean;
  /** Set when a feed is known dead and kept for history. */
  retired?: boolean;
}

/**
 * The live feeds East Sound probes. Mix of FM radio and TV across the four
 * East African markets, plus the BBC World Service as a global reference.
 */
export const REAL_STATION_FEEDS: readonly StationFeed[] = [
  // ---------------------------------------------------------------- Uganda FM
  {
    id: "radio-maria-ug",
    name: "101.8 Radio Maria Uganda",
    country: "UG",
    city: "Kampala",
    medium: "FM",
    frequency: "101.8",
    streamUrl: "http://dreamsiteradiocp.com:8052/stream",
    homepage: "http://www.radiomaria.ug/",
    source: "RadioBrowser",
    verified: false,
  },
  {
    id: "favour-fm-gulu",
    name: "104.1 Favour FM Gulu",
    country: "UG",
    city: "Gulu",
    medium: "FM",
    frequency: "104.1",
    streamUrl:
      "http://us5new.listen2myradio.com:2199/listen.php?port=8138&type=ice&mount=stream",
    homepage: "https://www.favourfm.org/",
    source: "RadioBrowser",
    verified: false,
  },
  {
    id: "kaboozi-fm",
    name: "104.4 Kaboozi FM",
    country: "UG",
    city: "Kampala",
    medium: "FM",
    frequency: "104.4",
    streamUrl: "http://162.244.80.52:8732/;stream.mp3",
    homepage: "https://akaboozi.fm/",
    source: "RadioBrowser",
    verified: false,
  },
  {
    id: "next-radio",
    name: "106.1 Next Radio",
    country: "UG",
    city: "Kampala",
    medium: "FM",
    frequency: "106.1",
    streamUrl:
      "https://stream-154.zeno.fm/lbca7zintcnuv?zs=P9UBEqoSSr69riqZniMYMw",
    homepage: "https://nextradio.co.ug/",
    source: "RadioBrowser",
    verified: false,
  },

  // ---------------------------------------------------------------- Uganda TV
  {
    id: "ntv-uganda",
    name: "NTV Uganda",
    country: "UG",
    city: "Kampala",
    medium: "TV",
    frequency: "TV",
    streamUrl:
      "https://ams-2629.antmedia.cloud/LiveApp/streams/abul2026_adaptive.m3u8",
    homepage: "https://ntv.co.ug/",
    source: "iptv-org",
    verified: true,
  },
  {
    id: "bukedde-tv-1",
    name: "Bukedde TV 1",
    country: "UG",
    city: "Kampala",
    medium: "TV",
    frequency: "TV",
    streamUrl: "https://stream.hydeinnovations.com/bukedde1flussonic/index.m3u8",
    homepage: "https://www.bukedde.co.ug/tv",
    source: "iptv-org",
    verified: true,
  },
  {
    id: "bukedde-tv-2",
    name: "Bukedde TV 2",
    country: "UG",
    city: "Kampala",
    medium: "TV",
    frequency: "TV",
    streamUrl:
      "https://stream.hydeinnovations.com/bukedde2flussonic/index.m3u8",
    homepage: "https://www.bukedde.co.ug/tv",
    source: "iptv-org",
    verified: false,
  },
  {
    id: "tv-west",
    name: "TV West",
    country: "UG",
    city: "Mbarara",
    medium: "TV",
    frequency: "TV",
    streamUrl:
      "https://stream.hydeinnovations.com/tvwest-flussonic/index.m3u8",
    homepage: "https://tvwest.co.ug/",
    source: "iptv-org",
    verified: false,
  },
  {
    id: "bbs-tv",
    name: "BBS TV",
    country: "UG",
    city: "Kampala",
    medium: "TV",
    frequency: "TV",
    streamUrl: "https://bbstv.ug/hls/ch01/index.m3u8",
    homepage: "https://bbstv.ug/",
    source: "iptv-org",
    verified: false,
  },
  {
    id: "kstv",
    name: "KSTV",
    country: "UG",
    city: "Kampala",
    medium: "TV",
    frequency: "TV",
    streamUrl: "https://live.esteem.africa/kstv/hls/0/stream.m3u8",
    homepage: "https://kstv.co.ug/",
    source: "iptv-org",
    verified: false,
  },
  {
    id: "rwenzori-tv",
    name: "Rwenzori TV",
    country: "UG",
    city: "Fort Portal",
    medium: "TV",
    frequency: "TV",
    streamUrl: "https://stream.rwenzoritv.com:3232/live/rwenzoritvlive.m3u8",
    homepage: "https://rwenzoritv.com/",
    source: "iptv-org",
    verified: false,
  },

  // ---------------------------------------------------------------- Kenya FM
  {
    id: "capital-fm-ke",
    name: "98.4 Capital FM Kenya",
    country: "KE",
    city: "Nairobi",
    medium: "FM",
    frequency: "98.4",
    streamUrl: "https://atunwadigital.streamguys1.com/capitalfm",
    homepage: "https://www.capitalfm.co.ke/fresh/",
    source: "RadioBrowser",
    verified: false,
  },
  {
    id: "campus-radio-ke",
    name: "Campus Radio Kenya",
    country: "KE",
    city: "Nairobi",
    medium: "FM",
    frequency: "FM",
    streamUrl: "https://stream.zenolive.com/mayn36v1v8quv.aac",
    homepage: "https://www.campusradio.co.ke/",
    source: "RadioBrowser",
    verified: false,
  },

  // ---------------------------------------------------------------- Kenya TV
  {
    id: "k24",
    name: "K24",
    country: "KE",
    city: "Nairobi",
    medium: "TV",
    frequency: "TV",
    streamUrl:
      "https://livecdn.premiumfree.tv/afxpstr/K24Backup/index.m3u8",
    homepage: "https://k24tv.co.ke/",
    source: "iptv-org",
    verified: true,
  },
  {
    id: "inooro-tv",
    name: "Inooro TV",
    country: "KE",
    city: "Nairobi",
    medium: "TV",
    frequency: "TV",
    streamUrl:
      "https://live-onesignal.royalmedia.co.ke/live/T-MxRsFebq6zx7k2QFMbLw.m3u8",
    homepage: "https://inooro.co.ke/",
    source: "iptv-org",
    verified: false,
  },
  {
    id: "akili-kids",
    name: "Akili Kids",
    country: "KE",
    city: "Nairobi",
    medium: "TV",
    frequency: "TV",
    streamUrl:
      "https://m6.livecdn.io/akilikids.co.ke/akilikids.smil/playlist.m3u8",
    homepage: "https://akili.co.ke/",
    source: "iptv-org",
    verified: false,
  },
  {
    id: "aviation-tv",
    name: "Aviation TV",
    country: "KE",
    city: "Nairobi",
    medium: "TV",
    frequency: "TV",
    streamUrl:
      "http://streamer02.nbo1.angani.co:1935/aviationtv/myStream/playlist.m3u8",
    homepage: "https://aviationtv.co.ke/",
    source: "iptv-org",
    verified: false,
  },

  // -------------------------------------------------------------- Tanzania FM
  {
    id: "capital-radio-tz",
    name: "Capital Radio Tanzania",
    country: "TZ",
    city: "Dar es Salaam",
    medium: "FM",
    frequency: "FM",
    streamUrl: "https://capitalradio.radioca.st/stream",
    homepage: "https://www.capitalradio.co.tz/",
    source: "RadioBrowser",
    verified: false,
  },
  {
    id: "clouds-fm-tz",
    name: "Clouds FM",
    country: "TZ",
    city: "Dar es Salaam",
    medium: "FM",
    frequency: "FM",
    streamUrl: "http://eu6.fastcast4u.com:5306/;",
    homepage: "https://cloudsmedia.co.tz/",
    source: "RadioBrowser",
    verified: false,
  },
  {
    id: "east-africa-radio",
    name: "East Africa Radio FM",
    country: "TZ",
    city: "Dar es Salaam",
    medium: "FM",
    frequency: "FM",
    streamUrl: "https://eatv.radioca.st/stream",
    homepage: "https://www.eastafricaradio.com/",
    source: "RadioBrowser",
    verified: false,
  },

  // -------------------------------------------------------------- Tanzania TV
  {
    id: "tbc1",
    name: "TBC1",
    country: "TZ",
    city: "Dar es Salaam",
    medium: "TV",
    frequency: "TV",
    streamUrl:
      "https://tbc.maintek.co/LiveApp/streams/YF43nTzH0duMyUA2130641323343587.m3u8",
    homepage: "https://tbc.co.tz/",
    source: "iptv-org",
    verified: false,
  },
  {
    id: "tbc2",
    name: "TBC2",
    country: "TZ",
    city: "Dar es Salaam",
    medium: "TV",
    frequency: "TV",
    streamUrl:
      "https://stream-134630.castr.net/5fe35eae8c53540cab83659a/live_67aeec90584911f1ab60174d68f7c06e/index.fmp4.m3u8",
    homepage: "https://tbc.co.tz/",
    source: "iptv-org",
    verified: false,
  },
  {
    id: "tanzania-safari-channel",
    name: "Tanzania Safari Channel",
    country: "TZ",
    city: "Dar es Salaam",
    medium: "TV",
    frequency: "TV",
    streamUrl:
      "https://stream-134630.castr.net/5fe35eae8c53540cab83659a/live_7b9dd9c9c684b2ab41800687d68f7e0c/index.fmp4.m3u8",
    homepage: "https://tanzaniasafarichannel.com/",
    source: "iptv-org",
    verified: false,
  },

  // -------------------------------------------------------------- Rwanda FM
  {
    id: "magic-fm-rw",
    name: "90.7 Magic FM Rwanda",
    country: "RW",
    city: "Kigali",
    medium: "FM",
    frequency: "90.7",
    streamUrl: "http://listen.rba.co.rw:8080/;",
    homepage: "http://rba.co.rw/radio/7/Magic-Fm",
    source: "RadioBrowser",
    verified: false,
  },
  {
    id: "radio-maria-rw",
    name: "Radio Maria Rwanda",
    country: "RW",
    city: "Kigali",
    medium: "FM",
    frequency: "FM",
    streamUrl: "http://dreamsiteradiocp.com:8044/stream",
    homepage: "http://www.radiomaria.rw/",
    source: "RadioBrowser",
    verified: false,
  },
  {
    id: "kiss-fm-rw",
    name: "KISS FM 102.3 Rwanda",
    country: "RW",
    city: "Kigali",
    medium: "FM",
    frequency: "102.3",
    streamUrl: "https://kissfm-atunwadigital.streamguys1.com/kissfm",
    homepage: "https://kissfm.rw/",
    source: "RadioBrowser",
    verified: false,
  },

  // -------------------------------------------------------------- Rwanda TV
  {
    id: "rtv-rwanda",
    name: "RTV Rwanda",
    country: "RW",
    city: "Kigali",
    medium: "TV",
    frequency: "TV",
    streamUrl:
      "https://5c46fa289c89f.streamlock.net/rtv25/rtv/playlist.m3u8",
    homepage: "https://rtv.rw/",
    source: "iptv-org",
    verified: false,
  },
  {
    id: "tv1-rw",
    name: "TV1 Rwanda",
    country: "RW",
    city: "Kigali",
    medium: "TV",
    frequency: "TV",
    streamUrl: "https://live.tv1.rw/index.m3u8",
    homepage: "https://tv1.rw/",
    source: "iptv-org",
    verified: true,
  },
  {
    id: "tv10-rw",
    name: "TV10 Rwanda",
    country: "RW",
    city: "Kigali",
    medium: "TV",
    frequency: "TV",
    streamUrl:
      "https://5c46fa289c89f.streamlock.net/pub1live/mystream/playlist.m3u8",
    homepage: "https://tv10.rw/",
    source: "iptv-org",
    verified: false,
  },
  {
    id: "btn-tv",
    name: "BTN TV",
    country: "RW",
    city: "Kigali",
    medium: "TV",
    frequency: "TV",
    streamUrl: "https://tv.btnrwanda.com:3973/live/btnv2live.m3u8",
    homepage: "https://btnrwanda.com/",
    source: "iptv-org",
    verified: false,
  },
];

/** Global reference feed, probed alongside the panel but never counted in it. */
export const REFERENCE_FEEDS: readonly StationFeed[] = [
  {
    id: "bbc-world-service",
    name: "BBC World Service (English/Africa)",
    country: "UG",
    city: "London",
    medium: "FM",
    frequency: "SW",
    streamUrl:
      "http://a.files.bbci.co.uk/media/live/manifesto/audio/simulcast/hls/nonuk/sbr_low/ak/bbc_world_service.m3u8",
    homepage: "https://www.bbc.co.uk/worldserviceradio",
    source: "BBC",
    verified: true,
  },
];

/** Panel feeds shown in the public monitor (reference feeds excluded). */
export const MONITORED_FEEDS: readonly StationFeed[] = REAL_STATION_FEEDS;

export function isFeedCountry(value: string): value is FeedCountry {
  return (FEED_COUNTRIES as readonly string[]).includes(value);
}
