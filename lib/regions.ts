/**
 * Uganda broadcast geography + the FM station panel BMAT ingests spin logs from.
 *
 * NOTE: the station panel is bundled demo fixture data so the portal is usable
 * without a live ingest feed. The names below are modelled on real Ugandan
 * broadcasters and the hubs are the actual regional radio centres, but the
 * pairing of name/hub/reach is illustrative — do not treat it as a verified
 * registry. Swap `FM_STATIONS` for the real panel feed (or a DB table) when the
 * ingest service is wired up.
 */

export const REGIONS = ["Central", "Eastern", "Western", "Northern"] as const;

export type Region = (typeof REGIONS)[number];

export function isRegion(value: string): value is Region {
  return (REGIONS as readonly string[]).includes(value);
}

/** Regional broadcast hubs the panel reports from. */
export const HUBS = [
  "Kampala",
  "Mukono",
  "Jinja",
  "Mbale",
  "Tororo",
  "Soroti",
  "Mbarara",
  "Fort Portal",
  "Kasese",
  "Kabale",
  "Gulu",
  "Lira",
  "Arua",
] as const;

export type Hub = (typeof HUBS)[number];

export interface Station {
  id: string;
  name: string;
  region: Region;
  /** Broadcast hub the station transmits from. */
  location: Hub;
  /** Transmitting frequency. Illustrative fixture data, not a UCC licence record. */
  frequency: string;
  /** Estimated weekly reach in the station's coverage area, in listeners. */
  reach: number;
}

export const FM_STATIONS: Station[] = [
  // Central — Kampala metro and the central corridor
  { id: "cbs-kla", frequency: "89.2 MHz", name: "CBS FM", region: "Central", location: "Kampala", reach: 1_450_000 },
  { id: "capital-kla", frequency: "91.3 MHz", name: "Capital FM", region: "Central", location: "Kampala", reach: 1_180_000 },
  { id: "bukedde-kla", frequency: "88.4 MHz", name: "Bukedde FM", region: "Central", location: "Kampala", reach: 1_320_000 },
  { id: "simba-kla", frequency: "87.5 MHz", name: "Radio Simba", region: "Central", location: "Kampala", reach: 1_040_000 },
  { id: "kfm-kla", frequency: "93.7 MHz", name: "KFM", region: "Central", location: "Kampala", reach: 980_000 },
  { id: "xfm-kla", frequency: "87.8 MHz", name: "X FM", region: "Central", location: "Kampala", reach: 860_000 },
  { id: "hits-kla", frequency: "88.1 MHz", name: "Hits FM", region: "Central", location: "Kampala", reach: 720_000 },
  { id: "hot100-kla", frequency: "88.7 MHz", name: "Hot 100", region: "Central", location: "Kampala", reach: 690_000 },
  { id: "record-kla", frequency: "89.0 MHz", name: "Record FM", region: "Central", location: "Kampala", reach: 610_000 },
  { id: "galaxy-kla", frequency: "100.2 MHz", name: "Galaxy FM", region: "Central", location: "Kampala", reach: 585_000 },
  { id: "top-kla", frequency: "89.3 MHz", name: "Top Radio", region: "Central", location: "Kampala", reach: 540_000 },
  { id: "dreams-muk", frequency: "89.6 MHz", name: "Dreams FM", region: "Central", location: "Mukono", reach: 430_000 },

  // Eastern — Jinja, Mbale, Tororo and the Teso sub-region
  { id: "gaaki-jin", frequency: "89.7 MHz", name: "Radio Gaaki", region: "Eastern", location: "Jinja", reach: 615_000 },
  { id: "busoga-jin", frequency: "89.9 MHz", name: "Busoga One FM", region: "Eastern", location: "Jinja", reach: 470_000 },
  { id: "pacis-mba", frequency: "90.2 MHz", name: "Radio Pacis", region: "Eastern", location: "Mbale", reach: 840_000 },
  { id: "better-mba", frequency: "92.9 MHz", name: "Better FM", region: "Eastern", location: "Mbale", reach: 615_000 },
  { id: "baba-mba", frequency: "90.5 MHz", name: "Baba FM", region: "Eastern", location: "Mbale", reach: 540_000 },
  { id: "star-mba", frequency: "90.8 MHz", name: "UBC Star FM", region: "Eastern", location: "Mbale", reach: 425_000 },
  { id: "rock-tor", frequency: "91.1 MHz", name: "Rock FM", region: "Eastern", location: "Tororo", reach: 265_000 },
  { id: "teso-sor", frequency: "91.4 MHz", name: "Voice of Teso", region: "Eastern", location: "Soroti", reach: 380_000 },

  // Western — Mbarara, Fort Portal, Kasese and Kigezi
  { id: "radiowest-mbr", frequency: "95.4 MHz", name: "Radio West", region: "Western", location: "Mbarara", reach: 905_000 },
  { id: "west-mbr", frequency: "91.7 MHz", name: "West FM", region: "Western", location: "Mbarara", reach: 690_000 },
  { id: "mustard-mbr", frequency: "92.0 MHz", name: "Mustard FM", region: "Western", location: "Mbarara", reach: 575_000 },
  { id: "crooze-mbr", frequency: "92.3 MHz", name: "Crooze FM", region: "Western", location: "Mbarara", reach: 505_000 },
  { id: "voice-toro", frequency: "92.6 MHz", name: "Voice of Toro", region: "Western", location: "Fort Portal", reach: 430_000 },
  { id: "life-kas", frequency: "93.2 MHz", name: "Voice of Life", region: "Western", location: "Kasese", reach: 395_000 },
  { id: "kigezi-kab", frequency: "93.5 MHz", name: "Kigezi Connect FM", region: "Western", location: "Kabale", reach: 310_000 },

  // Northern — Gulu, Lira and West Nile
  { id: "upcountry-gul", frequency: "96.3 MHz", name: "Upcountry FM", region: "Northern", location: "Gulu", reach: 520_000 },
  { id: "mega-gul", frequency: "97.0 MHz", name: "Mega FM", region: "Northern", location: "Gulu", reach: 465_000 },
  { id: "kachele-gul", frequency: "93.8 MHz", name: "Kachele FM", region: "Northern", location: "Gulu", reach: 350_000 },
  { id: "radio-wa-lir", frequency: "94.1 MHz", name: "Radio Wa", region: "Northern", location: "Lira", reach: 305_000 },
  { id: "westnile-aru", frequency: "94.4 MHz", name: "West Nile Radio", region: "Northern", location: "Arua", reach: 275_000 },
];

export const STATIONS_BY_REGION: Record<Region, Station[]> = REGIONS.reduce(
  (acc, region) => {
    acc[region] = FM_STATIONS.filter((s) => s.region === region);
    return acc;
  },
  {} as Record<Region, Station[]>,
);

export function stationsForRegion(region: Region): Station[] {
  return STATIONS_BY_REGION[region];
}

export function stationById(id: string): Station | undefined {
  return FM_STATIONS.find((s) => s.id === id);
}

/** Hubs that actually have a reporting station on the panel. */
export function activeHubs(): Hub[] {
  return [...new Set(FM_STATIONS.map((s) => s.location))];
}

export const REGION_META: Record<Region, { blurb: string; accent: string }> = {
  Central: { blurb: "Kampala metro & central corridor", accent: "#f59e0b" },
  Eastern: { blurb: "Jinja, Mbale & Teso sub-region", accent: "#10b981" },
  Western: { blurb: "Mbarara, Kasese & Ankole", accent: "#38bdf8" },
  Northern: { blurb: "Gulu, Lira & West Nile", accent: "#a78bfa" },
};
