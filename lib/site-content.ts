/**
 * Editorial + marketing content for the East Sound public site.
 *
 * Kept server-safe (no client imports) so pages and tests can share it.
 * The dashboard modules stay the source of truth for live data; this file
 * carries the storytelling layer the public site renders.
 */

/* ------------------------------------------------------------------ tiers */

export type TierId = "label" | "artist" | "broadcaster" | "cmo" | "venue";

export interface TierCard {
  id: TierId;
  role: string;
  label: string;
  icon: string;
  headline: string;
  blurb: string;
  features: string[];
  accent: string;
  cta: string;
  href: string;
}

export const TIERS: TierCard[] = [
  {
    id: "label",
    role: "artist",
    label: "Record Label Roster",
    icon: "Disc3",
    headline: "One delivery pipeline for every artist",
    blurb:
      "Multi-artist roster management, batch master uploads with spectral fingerprints and label-level revenue split across every confirmed spin.",
    features: [
      "Multi-artist roster with per-artist delivery status",
      "Batch master uploads with Web Audio fingerprints + ISRCs",
      "Label revenue dashboard across all roster releases",
      "ReSol split-sheet agreements signed before release",
    ],
    accent: "from-emerald-500/20 to-emerald-500/5",
    cta: "Open label workspace",
    href: "/dashboard/artist",
  },
  {
    id: "artist",
    role: "artist",
    label: "Single Artist",
    icon: "Mic",
    headline: "Your discography, your spin velocity",
    blurb:
      "Individual artist focus: upload masters, watch regional velocity heatmaps and toggle WhatsApp alerts for every confirmed spin.",
    features: [
      "Client-side spectral-energy master dropzone + ISRC",
      "Spin velocity heatmaps across Central · Eastern · Western · Northern",
      "WhatsApp / email alert toggles per station and hour",
      "ReSol split-sheet agreements before release",
    ],
    accent: "from-sky-500/20 to-sky-500/5",
    cta: "Open artist workspace",
    href: "/dashboard/artist",
  },
  {
    id: "broadcaster",
    role: "broadcaster",
    label: "Broadcaster / Station Manager",
    icon: "Radio",
    headline: "Station playout, verified, on one log",
    blurb:
      "Capture every playout, verify ad spots and generate UPRS cue sheets in one click — with captured audio evidence attached to each row.",
    features: [
      "Continuous stream logging (Icecast · HLS · RTSP · MP3)",
      "1-click Reportal UPRS cue sheet export (XLSX · PDF · CSV)",
      "AD Control: booked vs actual timestamp reconciliation",
      "Unmatched-audio flag queue before cue sheets go to CMOs",
    ],
    accent: "from-amber-500/20 to-amber-500/5",
    cta: "Open station workspace",
    href: "/dashboard/playout",
  },
  {
    id: "cmo",
    role: "cmo",
    label: "CMO / UPRS / MCSK / COSOTA Auditor",
    icon: "ShieldCheck",
    headline: "Unfiltered audit ledgers, daypart weighted",
    blurb:
      "Settle royalties on evidence: unfiltered playout ledgers, Prime vs Late Night daypart weighting, royalty split resolution and dispute queues.",
    features: [
      "Unfiltered audit ledger across all panel stations",
      "Daypart weighting: Prime vs Late Night EAT bands",
      "Unmatched audio flag queue with evidence playback",
      "Royalty split resolution + dispute alerts",
    ],
    accent: "from-violet-500/20 to-violet-500/5",
    cta: "Open auditor workspace",
    href: "/dashboard/cmo",
  },
  {
    id: "venue",
    role: "venue",
    label: "Venue Operator",
    icon: "Martini",
    headline: "Ambient listening, compliant by design",
    blurb:
      "Bars, clubs and restaurants run ambient listener nodes: every play is logged, UPRS public-performance compliance is badged and resident DJ sets stay on record.",
    features: [
      "Ambient listener node logs with timestamped plays",
      "UPRS Public Performance Compliance Badge 🟢",
      "Resident DJ set logs with track-level detail",
      "Automated compliance reporting to collecting societies",
    ],
    accent: "from-rose-500/20 to-rose-500/5",
    cta: "Open venue workspace",
    href: "/dashboard/venue",
  },
];

/* --------------------------------------------------------------- taxonomy */

export interface TaxonomyItem {
  label: string;
  blurb: string;
  href: string;
}

export const USE_CASES: TaxonomyItem[] = [
  {
    label: "CMOS / Auditors",
    blurb: "UPRS · MCSK · COSOTA royalty settlement on captured evidence",
    href: "/dashboard/cmo",
  },
  {
    label: "Record Labels",
    blurb: "One delivery pipeline for every master in the region",
    href: "/dashboard/artists",
  },
  {
    label: "Broadcasters",
    blurb: "Radio & TV playout logs that settle themselves",
    href: "/dashboard/playout",
  },
  {
    label: "Independent Artists",
    blurb: "Fingerprint your master, get alerts the moment it spins",
    href: "/dashboard/artist",
  },
  {
    label: "Venue Operators",
    blurb: "Ambient monitoring, UPRS compliance and venue playouts",
    href: "/dashboard/monitoring",
  },
  {
    label: "Media Agencies",
    blurb: "Audit ad spots against booked schedules, automatically",
    href: "/blog/ad-auditing-in-east-africa",
  },
];

export const SOLUTIONS: TaxonomyItem[] = [
  {
    label: "Vericast",
    blurb: "Airplay monitoring with 10-second audible evidence",
    href: "/charts",
  },
  {
    label: "Reportal",
    blurb: "1-click UPRS cue sheet generation for station managers",
    href: "/blog/reportal-uprs-cue-sheets",
  },
  {
    label: "ReSol",
    blurb: "Split-sheet rights agreed before the master ships",
    href: "/about#resol",
  },
  {
    label: "National Top 100",
    blurb: "The weekly Uganda airplay chart, free to browse",
    href: "/charts",
  },
  {
    label: "AD Control",
    blurb: "Ad-spot auditor: booked vs actual timestamps",
    href: "/blog/ad-auditing-in-east-africa",
  },
];

/* ------------------------------------------------------------------ teams */

export interface TeamMember {
  name: string;
  role: string;
  bio: string;
  initials: string;
  gradient: string;
}

export const TEAM: TeamMember[] = [
  {
    name: "Producer Ada",
    role: "Co-founder · Music",
    bio: "Built the first 7H Music Group masters in Kampala and still reviews every fingerprint.",
    initials: "PA",
    gradient: "from-emerald-500/30 to-emerald-500/10",
  },
  {
    name: "Engineer Tom",
    role: "Co-founder · Systems",
    bio: "Wires the FM panel: Icecast, HLS, RTSP — every ping is timestamped and signed.",
    initials: "ET",
    gradient: "from-sky-500/30 to-sky-500/10",
  },
  {
    name: "Compliance Nina",
    role: "Head of Rights",
    bio: "Settles UPRS cue sheets with daypart weighting — Prime vs Late Night, no exceptions.",
    initials: "NN",
    gradient: "from-violet-500/30 to-violet-500/10",
  },
  {
    name: "Auditor Opio",
    role: "Panel Operations",
    bio: "Keeps the 32-station Kampala panel honest: health badges, latency, match confidence.",
    initials: "WO",
    gradient: "from-amber-500/30 to-amber-500/10",
  },
  {
    name: "Researcher Faith",
    role: "Charts & Analytics",
    bio: "Turns captured spins into the national Top 100 and the regional velocity heatmaps.",
    initials: "MF",
    gradient: "from-rose-500/30 to-rose-500/10",
  },
  {
    name: "Onboarding Didas",
    role: "Artist Success",
    bio: "Walks every new artist through master delivery, splits and WhatsApp alerts.",
    initials: "DA",
    gradient: "from-teal-500/30 to-teal-500/10",
  },
];

export interface MissionStat {
  value: string;
  label: string;
}

export const MISSION_STATS: MissionStat[] = [
  { value: "32", label: "Stations in the Kampala panel" },
  { value: "4", label: "Countries: UG · KE · TZ · RW" },
  { value: "7d", label: "Rolling national chart window" },
  { value: "100%", label: "Spin evidence attached to ledger rows" },
];

/* -------------------------------------------------------------- stream feed */

export interface FeedPing {
  station: string;
  location: string;
  frequency: string;
  track: string;
  artist: string;
  minutesAgo: number;
  confidence: number;
}

/** Illustrative feed for the public stream monitor (marketing showcase). */
export const FEED_PING_SEED: FeedPing[] = [
  {
    station: "Capital FM",
    location: "Kampala",
    frequency: "91.3 MHz",
    track: "Mulongo",
    artist: "Ariah K",
    minutesAgo: 1,
    confidence: 0.98,
  },
  {
    station: "NBS TV",
    location: "Kampala",
    frequency: "DSTV 300",
    track: "Sili Muyembe",
    artist: "Nutty B",
    minutesAgo: 3,
    confidence: 0.94,
  },
  {
    station: "CBS FM",
    location: "Kampala",
    frequency: "89.2 MHz",
    track: "Mukisa (Remix)",
    artist: "Fresh Wicked",
    minutesAgo: 6,
    confidence: 0.96,
  },
  {
    station: "Galaxy FM",
    location: "Kampala",
    frequency: "100.2 MHz",
    track: "Ndi Wanyala",
    artist: "Duna C",
    minutesAgo: 9,
    confidence: 0.91,
  },
  {
    station: "Radio Simba",
    location: "Kampala",
    frequency: "87.5 MHz",
    track: "Mama Cita",
    artist: "Sheebah K",
    minutesAgo: 12,
    confidence: 0.88,
  },
  {
    station: "KFM",
    location: "Kampala",
    frequency: "93.7 MHz",
    track: "Bwerere",
    artist: "Ykee Benda",
    minutesAgo: 15,
    confidence: 0.93,
  },
  {
    station: "Bukedde FM",
    location: "Kampala",
    frequency: "88.4 MHz",
    track: "Ononya",
    artist: "Apass",
    minutesAgo: 19,
    confidence: 0.85,
  },
  {
    station: "Hot 100",
    location: "Kampala",
    frequency: "88.7 MHz",
    track: "Sukita",
    artist: "Lydia Jazmine",
    minutesAgo: 23,
    confidence: 0.9,
  },
  {
    station: "X FM",
    location: "Kampala",
    frequency: "87.8 MHz",
    track: "Kwata Dance",
    artist: "Mr. Leo",
    minutesAgo: 28,
    confidence: 0.87,
  },
  {
    station: "Record FM",
    location: "Kampala",
    frequency: "89.0 MHz",
    track: "Sembera",
    artist: "Naira Ali",
    minutesAgo: 34,
    confidence: 0.92,
  },
  {
    station: "Top Radio",
    location: "Kampala",
    frequency: "89.3 MHz",
    track: "Amala King",
    artist: "Trevor Carter",
    minutesAgo: 41,
    confidence: 0.89,
  },
  {
    station: "Hits FM",
    location: "Kampala",
    frequency: "88.1 MHz",
    track: "Fire inna Dance",
    artist: "Ziza Bafana",
    minutesAgo: 48,
    confidence: 0.84,
  },
];

/* ----------------------------------------------------------------- venues */

export interface VenuePing {
  venue: string;
  type: "Lounge" | "Bar" | "Club" | "Restaurant";
  location: string;
  track: string;
  artist: string;
  minutesAgo: number;
  compliance: "compliant" | "pending";
}

/** Illustrative ambient playout from registered Kampala venues. */
export const VENUE_PINGS: VenuePing[] = [
  {
    venue: "Cayenne Lounge",
    type: "Lounge",
    location: "Kololo",
    track: "Jennifer",
    artist: "Smooth Vibes",
    minutesAgo: 3,
    compliance: "compliant",
  },
  {
    venue: "Bikya Bar",
    type: "Bar",
    location: "Kampala Road",
    track: "Mulongo",
    artist: "Ariah K",
    minutesAgo: 8,
    compliance: "compliant",
  },
  {
    venue: "Dawn Suites Club",
    type: "Club",
    location: "Bugolobi",
    track: "Ononya",
    artist: "Apass",
    minutesAgo: 14,
    compliance: "compliant",
  },
  {
    venue: "The Upstairs Lounge",
    type: "Lounge",
    location: "Ntinda",
    track: "Sukita",
    artist: "Lydia Jazmine",
    minutesAgo: 21,
    compliance: "pending",
  },
  {
    venue: "Katogo Restaurant",
    type: "Restaurant",
    location: "Kabalagala",
    track: "Sembera",
    artist: "Naira Ali",
    minutesAgo: 30,
    compliance: "compliant",
  },
  {
    venue: "Nightshift Club",
    type: "Club",
    location: "Kawempe",
    track: "Kwata Dance",
    artist: "Mr. Leo",
    minutesAgo: 42,
    compliance: "compliant",
  },
];

export interface VenueNode {
  id: string;
  name: string;
  type: VenuePing["type"];
  location: string;
  nodeId: string;
  compliance: VenuePing["compliance"];
  pings24h: number;
  active: boolean;
}

/** Registered ambient listener nodes across Kampala. */
export const VENUE_NODES: VenueNode[] = [
  {
    id: "cayenne",
    name: "Cayenne Lounge",
    type: "Lounge",
    location: "Kololo",
    nodeId: "UG-VEN-001",
    compliance: "compliant",
    pings24h: 184,
    active: true,
  },
  {
    id: "bikya",
    name: "Bikya Bar",
    type: "Bar",
    location: "Kampala Road",
    nodeId: "UG-VEN-002",
    compliance: "compliant",
    pings24h: 142,
    active: true,
  },
  {
    id: "dawn",
    name: "Dawn Suites Club",
    type: "Club",
    location: "Bugolobi",
    nodeId: "UG-VEN-003",
    compliance: "compliant",
    pings24h: 312,
    active: true,
  },
  {
    id: "upstairs",
    name: "The Upstairs Lounge",
    type: "Lounge",
    location: "Ntinda",
    nodeId: "UG-VEN-004",
    compliance: "pending",
    pings24h: 96,
    active: true,
  },
  {
    id: "katogo",
    name: "Katogo Restaurant",
    type: "Restaurant",
    location: "Kabalagala",
    nodeId: "UG-VEN-005",
    compliance: "compliant",
    pings24h: 78,
    active: false,
  },
  {
    id: "nightshift",
    name: "Nightshift Club",
    type: "Club",
    location: "Kawempe",
    nodeId: "UG-VEN-006",
    compliance: "compliant",
    pings24h: 241,
    active: true,
  },
];

/* ------------------------------------------------------------- demo chart */

export type DemoRegion = "Central" | "Eastern" | "Western" | "Northern";

export interface ChartRow {
  rank: number;
  previousRank: number | null;
  movement: number | null;
  title: string;
  artist: string;
  spins7d: number;
  spinsPrev7d: number;
  peak: number;
  weeksOnChart: number;
  region: DemoRegion;
  confidence: number;
  /** 14-day velocity curve for the sparkline. */
  trend: number[];
  snippetSeed: string;
}

export const DEMO_CHART_ROWS: ChartRow[] = [
  {
    rank: 1,
    previousRank: 2,
    movement: 1,
    title: "Mulongo",
    artist: "Ariah K",
    spins7d: 412,
    spinsPrev7d: 356,
    peak: 1,
    weeksOnChart: 6,
    region: "Central",
    confidence: 0.98,
    trend: [6, 7, 8, 9, 10, 11, 12, 13, 14, 16, 18, 20, 22, 24],
    snippetSeed: "mulongo-ariah-k",
  },
  {
    rank: 2,
    previousRank: 1,
    movement: -1,
    title: "Sili Muyembe",
    artist: "Nutty B",
    spins7d: 388,
    spinsPrev7d: 401,
    peak: 1,
    weeksOnChart: 8,
    region: "Central",
    confidence: 0.94,
    trend: [9, 9, 10, 11, 11, 12, 13, 13, 12, 14, 13, 15, 16, 17],
    snippetSeed: "sili-muyembe-nutty-b",
  },
  {
    rank: 3,
    previousRank: 5,
    movement: 2,
    title: "Mukisa (Remix)",
    artist: "Fresh Wicked",
    spins7d: 341,
    spinsPrev7d: 252,
    peak: 3,
    weeksOnChart: 4,
    region: "Eastern",
    confidence: 0.96,
    trend: [3, 4, 5, 6, 8, 9, 11, 13, 15, 17, 19, 21, 23, 26],
    snippetSeed: "mukisa-remix-fresh-wicked",
  },
  {
    rank: 4,
    previousRank: null,
    movement: null,
    title: "Ndi Wanyala",
    artist: "Duna C",
    spins7d: 302,
    spinsPrev7d: 0,
    peak: 4,
    weeksOnChart: 1,
    region: "Central",
    confidence: 0.91,
    trend: [0, 0, 2, 5, 9, 14, 19, 24, 28, 32, 36, 39, 42, 45],
    snippetSeed: "ndi-wanyala-duna-c",
  },
  {
    rank: 5,
    previousRank: 3,
    movement: -2,
    title: "Mama Cita",
    artist: "Sheebah K",
    spins7d: 286,
    spinsPrev7d: 310,
    peak: 3,
    weeksOnChart: 7,
    region: "Western",
    confidence: 0.88,
    trend: [12, 12, 13, 13, 14, 15, 15, 16, 16, 17, 16, 18, 17, 19],
    snippetSeed: "mama-cita-sheebah-k",
  },
  {
    rank: 6,
    previousRank: 8,
    movement: 2,
    title: "Bwerere",
    artist: "Ykee Benda",
    spins7d: 261,
    spinsPrev7d: 198,
    peak: 6,
    weeksOnChart: 5,
    region: "Northern",
    confidence: 0.93,
    trend: [4, 5, 6, 7, 9, 11, 13, 15, 17, 18, 20, 21, 23, 25],
    snippetSeed: "bwerere-ykee-benda",
  },
  {
    rank: 7,
    previousRank: 6,
    movement: -1,
    title: "Ononya",
    artist: "Apass",
    spins7d: 244,
    spinsPrev7d: 262,
    peak: 5,
    weeksOnChart: 6,
    region: "Eastern",
    confidence: 0.85,
    trend: [9, 10, 10, 11, 12, 12, 13, 13, 14, 14, 15, 15, 16, 17],
    snippetSeed: "ononya-apass",
  },
  {
    rank: 8,
    previousRank: 11,
    movement: 3,
    title: "Sukita",
    artist: "Lydia Jazmine",
    spins7d: 229,
    spinsPrev7d: 161,
    peak: 8,
    weeksOnChart: 3,
    region: "Central",
    confidence: 0.9,
    trend: [2, 3, 4, 6, 8, 10, 12, 14, 16, 18, 20, 21, 22, 24],
    snippetSeed: "sukita-lydia-jazmine",
  },
  {
    rank: 9,
    previousRank: 9,
    movement: 0,
    title: "Kwata Dance",
    artist: "Mr. Leo",
    spins7d: 211,
    spinsPrev7d: 208,
    peak: 7,
    weeksOnChart: 9,
    region: "Western",
    confidence: 0.87,
    trend: [8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13, 14, 15],
    snippetSeed: "kwata-dance-mr-leo",
  },
  {
    rank: 10,
    previousRank: 14,
    movement: 4,
    title: "Sembera",
    artist: "Naira Ali",
    spins7d: 196,
    spinsPrev7d: 121,
    peak: 10,
    weeksOnChart: 2,
    region: "Northern",
    confidence: 0.92,
    trend: [1, 2, 3, 4, 6, 9, 11, 14, 16, 18, 19, 21, 22, 24],
    snippetSeed: "sembera-naira-ali",
  },
];

/* ----------------------------------------------------------------- articles */

export type ArticleCategory =
  | "Airplay Charts"
  | "UPRS & Rights"
  | "Music Tech"
  | "Ad Auditing"
  | "Platform Updates";

export const ARTICLE_CATEGORIES: ArticleCategory[] = [
  "Airplay Charts",
  "UPRS & Rights",
  "Music Tech",
  "Ad Auditing",
  "Platform Updates",
];

export type ArticleBlock =
  | { type: "paragraph"; text: string }
  | { type: "heading"; text: string }
  | { type: "list"; items: string[] }
  | { type: "quote"; text: string; cite?: string }
  | { type: "callout"; text: string };

export interface Article {
  slug: string;
  title: string;
  category: ArticleCategory;
  excerpt: string;
  author: string;
  authorRole: string;
  date: string;
  readMinutes: number;
  /** Tailwind gradient classes for the cover block (no external assets). */
  cover: string;
  tags: string[];
  body: ArticleBlock[];
}

export const ARTICLES: Article[] = [
  {
    slug: "the-national-airplay-chart",
    title: "How East Sound builds Uganda's national airplay chart",
    category: "Airplay Charts",
    excerpt:
      "One FM panel, one timestamp per spin, and a rolling seven-day window — the mechanics behind the weekly Top 100.",
    author: "Faith Nakanyike",
    authorRole: "Charts & Analytics",
    date: "2026-10-28",
    readMinutes: 6,
    cover: "from-emerald-500/30 via-emerald-500/10 to-slate-950",
    tags: ["Top 100", "Panel", "Evidence"],
    body: [
      {
        type: "paragraph",
        text: "Every Monday morning, East Sound publishes the national Top 100 from the connected FM panel — a fixed set of Kampala stations whose playout we capture continuously. A spin only counts when the captured audio matches a delivered master by spectral fingerprint; the row keeps the timestamp, the station and the confidence score.",
      },
      { type: "heading", text: "A timestamp is a promise" },
      {
        type: "paragraph",
        text: "Each row on the chart carries the detected play time in EAT, the station's frequency band, and a match confidence. That is what lets a label dispute a spin weeks later — and what lets a CMO settle on the same number.",
      },
      {
        type: "list",
        items: [
          "Rolling seven-day reporting window, Monday to Sunday",
          "Previous week compared only against the fourteen days before it",
          "Debuts, biggest climbers and fallers read straight off the curve",
          "Evidence snippets attached for the top ten, ten seconds each",
        ],
      },
      {
        type: "callout",
        text: "The chart is not a mood. It is a ledger of what the panel actually played.",
      },
      {
        type: "heading", text: "What we do not claim" },
      {
        type: "paragraph",
        text: "The panel is a panel — thirty-two stations across Kampala and the regional hubs. Rankings reflect captured plays in the connected panel, not all Ugandan broadcasts, and all-time peak positions stay unknown until a chart-history store goes live.",
      },
    ],
  },
  {
    slug: "reportal-uprs-cue-sheets",
    title: "Reportal: one-click UPRS cue sheets from station logs",
    category: "UPRS & Rights",
    excerpt:
      "Turn captured playout into a compliant UPRS cue sheet in XLSX or PDF — with daypart weighting applied before the totals.",
    author: "Nina Akech",
    authorRole: "Head of Rights",
    date: "2026-10-21",
    readMinutes: 5,
    cover: "from-sky-500/30 via-sky-500/10 to-slate-950",
    tags: ["UPRS", "Reportal", "Cue sheets"],
    body: [
      {
        type: "paragraph",
        text: "A UPRS cue sheet has to reconcile what a station actually played with what it reported. Reportal does the reconciliation: it filters the station's captured spins for the reporting period, groups them by recording, applies daypart weighting and emits a document the licensing office can read.",
      },
      { type: "heading", text: "Daypart weighting, Prime vs Late Night" },
      {
        type: "paragraph",
        text: "Each spin is placed in its EAT band. Prime-time plays earn the standard indicative pool rate; Late Night plays earn a reduced weighting. The totals on the exported sheet already reflect that weighting — nobody recalculates by hand.",
      },
      {
        type: "list",
        items: [
          "Filter: station, recording, period, band",
          "Exports: XLSX (dependency-free OOXML), PDF, CSV",
          "Evidence audio referenced per row, not embedded",
          "Unmatched audio stays in the flag queue until the station resolves it",
        ],
      },
      {
        type: "quote",
        text: "Cue sheets were the last thing anyone did on a Sunday night. Now they are the first thing that happens on Monday.",
        cite: "Broadcaster feedback, pilot week",
      },
      { type: "heading", text: "Who gets the file" },
      {
        type: "paragraph",
        text: "The station manager reviews and signs the sheet in the dashboard. The CMO auditor sees it in the unfiltered ledger with the same weights applied — the same number on both sides of the settlement.",
      },
    ],
  },
  {
    slug: "resol-split-sheets-before-release",
    title: "ReSol: agree the split before the master ships",
    category: "UPRS & Rights",
    excerpt:
      "Spectral fingerprints on the dropzone, ISRC generated in-region, and split-sheet agreements signed digitally — before release day.",
    author: "Didas Mukasa",
    authorRole: "Artist Success",
    date: "2026-10-14",
    readMinutes: 7,
    cover: "from-violet-500/30 via-violet-500/10 to-slate-950",
    tags: ["ReSol", "Masters", "ISRC"],
    body: [
      {
        type: "paragraph",
        text: "The master dropzone runs a Web Audio OfflineAudioContext pass in the browser: it renders a spectral-energy fingerprint of your upload and assigns an ISRC in the UG-ESD-26 block before anything leaves your machine. The fingerprint is what the panel matches against later — not the file name, not a hunch.",
      },
      { type: "heading", text: "Split sheets, digitally" },
      {
        type: "paragraph",
        text: "ReSol pairs the fingerprint with a split-sheet module: producers, featured artists and labels agree percentages and signing order in the app. The agreement is attached to the master delivery — royalties settle against the split everyone already signed.",
      },
      {
        type: "list",
        items: [
          "ISRC generated as UG-ESD-26-XXXXX from a regional registry block",
          "Offline spectral hash computed client-side before upload",
          "Split-sheet agreement versioned with the master",
          "No release without an agreed split — the workflow blocks the ship",
        ],
      },
      {
        type: "callout",
        text: "Rights decided at delivery time are rights that never need a meeting later.",
      },
    ],
  },
  {
    slug: "ad-auditing-in-east-africa",
    title: "AD Control: auditing ad spots across Kampala's airwaves",
    category: "Ad Auditing",
    excerpt:
      "Booked schedule vs actual timestamp, station by station — how media agencies reconcile what they paid for with what actually aired.",
    author: "Opio Atube",
    authorRole: "Panel Operations",
    date: "2026-10-07",
    readMinutes: 6,
    cover: "from-amber-500/30 via-amber-500/10 to-slate-950",
    tags: ["AD Control", "Agencies", "Evidence"],
    body: [
      {
        type: "paragraph",
        text: "Agencies book ad spots; stations air them; somewhere in between, the two schedules drift. AD Control watches the panel continuously, flags every spot that aired outside its booked window and produces an audit log a media agency can reconcile against its booking sheet.",
      },
      { type: "heading", text: "Booked vs actual" },
      {
        type: "paragraph",
        text: "Each row carries the booked start, the booked duration, the actual detected start and the deviation in seconds. Spots that aired long, short, late or not at all are separated into an exception queue with the evidence snippet attached.",
      },
      {
        type: "list",
        items: [
          "Deviation tolerance configured per campaign",
          "Exception queue: overrun, underrun, late, missing",
          "Evidence audio per flagged spot for dispute packets",
          "One PDF audit per campaign, ready for the agency reconciliation call",
        ],
      },
      {
        type: "quote",
        text: "The dispute call used to be about who remembered what. Now it is about the timestamps.",
        cite: "Media agency pilot",
      },
    ],
  },
  {
    slug: "station-health-badges",
    title: "The station registry: health badges, latency and match confidence",
    category: "Music Tech",
    excerpt:
      "Why a 🟢 badge on a station row means something — and what 🔴 keeps a cue sheet honest.",
    author: "Tom Awino",
    authorRole: "Co-founder · Systems",
    date: "2026-09-29",
    readMinutes: 5,
    cover: "from-rose-500/30 via-rose-500/10 to-slate-950",
    tags: ["Registry", "Monitoring", "Latency"],
    body: [
      {
        type: "paragraph",
        text: "Every station in the registry streams into East Sound: Icecast, HLS, RTSP or plain MP3. The registry keeps a heartbeat per stream — ping latency, last heard, and the match confidence of recent spins — and shows it as a badge on the row.",
      },
      { type: "heading", text: "Green is a promise, red is a reason" },
      {
        type: "paragraph",
        text: "🟢 means the stream is healthy, the heartbeat is recent and spins from that station are matching at high confidence. 🔴 means something broke: stream down, heartbeat stale, or confidence fallen below threshold. A cue sheet built while a station is red is flagged, not silently trusted.",
      },
      {
        type: "list",
        items: [
          "Health: stream status, heartbeat age, listener count",
          "Latency: ping round-trip to the station's endpoint",
          "Confidence: rolling match score of recent fingerprints",
          "Inline preview: one click plays the station's live feed",
        ],
      },
      {
        type: "callout",
        text: "Badges are how a panel stays honest at three in the morning.",
      },
    ],
  },
  {
    slug: "whatsapp-alerts-artists",
    title: "WhatsApp airplay alerts: the moment your song spins",
    category: "Music Tech",
    excerpt:
      "Artists get a message — station, time, song — the moment a confirmed spin lands, signed by the notification outbox worker.",
    author: "Ada Nabwalo",
    authorRole: "Co-founder · Music",
    date: "2026-09-20",
    readMinutes: 4,
    cover: "from-teal-500/30 via-teal-500/10 to-slate-950",
    tags: ["Alerts", "Artists", "Outbox"],
    body: [
      {
        type: "paragraph",
        text: "Confirmed spin, outbound message. An event-driven outbox worker drains the notification queue, renders the alert and hands it to the configured transport — WhatsApp, email or webhook — with a secret signature key on every delivery.",
      },
      { type: "heading", text: "What the artist sees" },
      {
        type: "paragraph",
        text: "A single line: station, time in EAT, song title, and a confidence chip. Nothing else — no dashboard required, no scrolling back through a feed.",
      },
      {
        type: "quote",
        text: "“🔥 Airplay Alert! ‘Mulongo’ just played on Capital FM Kampala at 14:32 EAT.”",
      },
      {
        type: "list",
        items: [
          "Durable outbox: alerts survive restarts, retried in order",
          "Per-artist preferences: which stations, which hours",
          "Webhooks signed with HMAC secrets for agency pipelines",
          "The simulator in the artist workspace shows exactly what leaves",
        ],
      },
    ],
  },
  {
    slug: "venue-ambient-monitoring-rollout",
    title: "Venue ambient monitoring: bars, clubs and restaurants join the panel",
    category: "Platform Updates",
    excerpt:
      "Ambient listener nodes now log every play in registered Kampala venues — with the UPRS Public Performance Compliance Badge making compliance visible at the door.",
    author: "Tom Awino",
    authorRole: "Co-founder · Systems",
    date: "2026-11-01",
    readMinutes: 4,
    cover: "from-rose-500/30 via-rose-500/10 to-slate-950",
    tags: ["Venues", "UPRS", "Ambient"],
    body: [
      {
        type: "paragraph",
        text: "Public performance royalties do not stop at the radio studio. From this month, registered Kampala lounges, bars, restaurants and clubs can run an East Sound ambient listener node: the venue's house sound feeds a small capture client, every track is timestamped, and plays settle to UPRS through the same evidence pipeline the FM panel uses.",
      },
      { type: "heading", text: "The compliance badge" },
      {
        type: "paragraph",
        text: "Each venue node carries a Public Performance Compliance Badge: green when every logged play in the reporting window is matched and reported, amber when plays are pending verification. The badge is designed to be shown — at the door, on a receipt, on a venue's social profile.",
      },
      {
        type: "list",
        items: [
          "Ambient node logs plays with timestamp, track and fingerprint",
          "Resident DJ sets are captured track-by-track, not as one block",
          "Badge state recalculates nightly against the UPRS reporting window",
          "Venues with a green badge settle faster — fewer dispute calls",
        ],
      },
      {
        type: "callout",
        text: "Compliance is a badge you can wear, not a letter you file.",
      },
      { type: "heading", text: "What venues get" },
      {
        type: "paragraph",
        text: "A venue workspace shows the ambient ping feed, resident DJ set logs, nightly compliance status and a one-click settlement export for the collecting society. The monitoring view is public: visitors can watch pings land from Cayenne Lounge to Dawn Suites Club in real time.",
      },
    ],
  },
];

/* ----------------------------------------------------------------- about */

export const ORIGIN_STORY = [
  {
    heading: "From a Kampala studio to the airwaves",
    paragraphs: [
      "East Sound began inside 7H Music Group — a Kampala studio where producers finished masters on Sunday nights and then spent Monday chasing the same songs across every FM dial, one text message at a time.",
      "The fix was never a bigger studio. It was a system: capture what each station actually plays, match it against the masters we delivered, and give labels, stations and collecting societies one number for every spin.",
    ],
  },
  {
    heading: "One panel, one source of truth",
    paragraphs: [
      "Today the connected FM panel spans Kampala and the regional hubs — Central, Eastern, Western and Northern — feeding the national Top 100, the station registry and the UPRS cue sheets that settle royalties.",
      "East Sound stays close to BMAT's operating-system approach: Vericast for monitoring, Reportal for compliance, ReSol for rights, AD Control for advertising, and the national charts everyone can read.",
    ],
  },
];

export const VALUES: Array<{ title: string; text: string }> = [
  {
    title: "Evidence before opinions",
    text: "Every spin carries a timestamp and a confidence score. Disputes are settled on the ledger, not in a meeting.",
  },
  {
    title: "Regional by default",
    text: "EAT timezones, Ugandan ISRC blocks, daypart bands that match how people actually listen.",
  },
  {
    title: "Panel honesty",
    text: "Health badges on every station row. A broken stream is a red badge, not a silent gap in the chart.",
  },
];
