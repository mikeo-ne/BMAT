import { GUIDES } from "./guides";
// Public, non-sensitive data shown on the marketing site. Sample data only.
import { seeded } from "../safe";

export const REGIONS = ["Central", "Western", "Eastern", "Northern"] as const;
export type Region = (typeof REGIONS)[number];

export type ChartRow = {
  rank: number;
  title: string;
  artist: string;
  spins: number;
  move: number; // + up, - down, 0 same
  seed: number;
  snippetUrl?: string;
};

const TITLES = [
  "Kampala Nights", "Sente Zange", "Boda Love", "Nyabo Wange", "Owino Drip", "Mpola Mpola",
  "Rolex at Midnight", "Lake Breeze", "Kikadde", "Ntinda Anthem", "Gulu Gold", "Rwenzori Rain",
  "Mbale Sunrise", "Jinja Flow", "Ekitiibwa", "Masaka Groove", "Nile Fever", "Taxi Park Riddim",
];
const ARTISTS = [
  "Nalu Akello", "K-Ssenyonga", "Zawadi B", "Okello Prime", "Lamaro Grace", "Mutebi X",
  "Atim & The Band", "Kato Soul", "Namata Q", "DJ Wakiso",
];

function buildChart(seed: number): ChartRow[] {
  const r = seeded(seed);
  const used = new Set<number>();
  const rows: ChartRow[] = [];
  let spins = 900 + Math.floor(r() * 300);
  for (let i = 0; i < 10; i++) {
    let t = Math.floor(r() * TITLES.length);
    while (used.has(t)) t = (t + 1) % TITLES.length;
    used.add(t);
    spins -= 20 + Math.floor(r() * 70);
    rows.push({
      rank: i + 1,
      title: TITLES[t],
      artist: ARTISTS[Math.floor(r() * ARTISTS.length)],
      spins,
      move: Math.floor(r() * 7) - 3,
      seed: seed * 10 + i,
    });
  }
  return rows;
}

export const CHARTS: Record<"All" | Region, ChartRow[]> = {
  All: buildChart(7),
  Central: buildChart(11),
  Western: buildChart(23),
  Eastern: buildChart(37),
  Northern: buildChart(41),
};

export const PLAYOUT_TICKER = [
  { station: "Capital FM", freq: "91.3", track: "Kampala Nights — Nalu Akello" },
  { station: "CBS FM", freq: "88.8", track: "Ekitiibwa — Mutebi X" },
  { station: "NBS TV", freq: "TV", track: "Ad break · Telecom spot 30s" },
  { station: "Capital FM", freq: "91.3", track: "Talk · Breakfast show" },
  { station: "CBS FM", freq: "88.8", track: "Boda Love — Zawadi B" },
  { station: "NBS TV", freq: "TV", track: "Gulu Gold — Lamaro Grace" },
];

export const SOLUTIONS = [
  { id: "vericast", name: "Vericast", desc: "24/7 broadcast monitoring & fingerprint matching." },
  { id: "reportal", name: "Reportal", desc: "Self-serve usage reporting for licensees." },
  { id: "resol", name: "ReSol", desc: "Rights resolution, claims & conflict settlement." },
  { id: "charts", name: "Music Charts", desc: "Verified national & regional airplay charts." },
  { id: "adcontrol", name: "AD Control", desc: "Proof-of-play auditing for advertisers." },
] as const;

export type BlogPost = {
  slug: string;
  title: string;
  category: "Guides" | "Industry" | "Product" | "Charts" | "Policy";
  excerpt: string;
  date: string;
  minutes: number;
  body: string[];
  sources?: { title: string; url: string }[];
};

export const POSTS: BlogPost[] = [
  ...GUIDES,
  {
    slug: "why-proof-of-play-matters",
    title: "Why proof-of-play changes royalty conversations in Uganda",
    category: "Industry",
    excerpt: "Evidence clips turn 'we think it played' into a timestamped record both sides can hear.",
    date: "2026-10-28",
    minutes: 5,
    body: [
      "Royalty disputes usually stall on one question: did the song actually play? A detection log with a station, a timestamp and a 10-second evidence clip settles that question before it becomes an argument.",
      "East Sound attaches audible evidence to every detection so CMOs, labels and broadcasters are reading from the same record.",
    ],
  },
  {
    slug: "regional-charts-launch",
    title: "Regional airplay charts: Central, Western, Eastern and Northern",
    category: "Charts",
    excerpt: "National charts hide regional hits. Splitting by region shows where songs really break.",
    date: "2026-10-21",
    minutes: 4,
    body: ["Regional charts are computed from the same detection pipeline as the national chart, filtered by the transmitter region of each station."],
  },
  {
    slug: "cue-sheets-in-one-click",
    title: "UPRS cue sheets in one click for broadcasters",
    category: "Product",
    excerpt: "Your playout log, matched and formatted — export to PDF or Excel in seconds.",
    date: "2026-10-14",
    minutes: 3,
    body: ["The broadcaster dashboard builds the cue sheet from matched detections and exports PDF or XLSX directly in your browser."],
  },
  {
    slug: "public-performance-venues",
    title: "What public performance compliance means for bars and clubs",
    category: "Policy",
    excerpt: "Ambient listener nodes give venues a simple, visible compliance status.",
    date: "2026-10-07",
    minutes: 6,
    body: ["Venues that play music publicly need a licence. Listener nodes log what plays so the licence fee reflects reality."],
  },
  {
    slug: "batch-fingerprinting",
    title: "Batch-fingerprint your masters before release",
    category: "Product",
    excerpt: "Drop a folder of masters and get fingerprints, duplicates and ISRC gaps flagged.",
    date: "2026-09-30",
    minutes: 4,
    body: ["Fingerprinting before release means the first spin on radio is matched to you — not to the unmatched queue."],
  },
];
