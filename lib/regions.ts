/**
 * Uganda broadcast geography + the FM station panel BMAT ingests spin logs from.
 *
 * NOTE: the station panel is bundled demo fixture data so the portal is usable
 * without a live ingest feed. Swap `FM_STATIONS` for the real panel feed (or a
 * DB table) when the ingest service is wired up.
 */

export const REGIONS = ["Central", "Eastern", "Western", "Northern"] as const;

export type Region = (typeof REGIONS)[number];

export function isRegion(value: string): value is Region {
  return (REGIONS as readonly string[]).includes(value);
}

export interface Station {
  id: string;
  name: string;
  region: Region;
  /** Estimated weekly reach in the station's coverage area, in listeners. */
  reach: number;
}

export const FM_STATIONS: Station[] = [
  // Central — Kampala / Wakiso / Mukono / Luwero corridor
  { id: "cbs-kla", name: "CBS FM", region: "Central", reach: 1_450_000 },
  { id: "capital-kla", name: "Capital FM", region: "Central", reach: 1_180_000 },
  { id: "kfm-kla", name: "KFM", region: "Central", reach: 980_000 },
  { id: "xfm-kla", name: "X FM", region: "Central", reach: 860_000 },
  { id: "bukedde-kla", name: "Bukedde FM", region: "Central", reach: 1_320_000 },
  { id: "simba-kla", name: "Radio Simba", region: "Central", reach: 1_040_000 },
  { id: "hits-kla", name: "Hits FM", region: "Central", reach: 720_000 },
  { id: "hot100-kla", name: "Hot 100", region: "Central", reach: 690_000 },
  { id: "record-kla", name: "Record FM", region: "Central", reach: 610_000 },
  { id: "galaxy-kla", name: "Galaxy FM", region: "Central", reach: 585_000 },

  // Eastern — Mbale / Jinja / Tororo / Iganga / Soroti
  { id: "pacis-mba", name: "Radio Pacis", region: "Eastern", reach: 840_000 },
  { id: "better-mba", name: "Better FM", region: "Eastern", reach: 615_000 },
  { id: "baba-mba", name: "Baba FM", region: "Eastern", reach: 540_000 },
  { id: "busoga-jin", name: "Busoga Broadcast", region: "Eastern", reach: 470_000 },
  { id: "star-mba", name: "UBC Star FM", region: "Eastern", reach: 425_000 },
  { id: "teso-sor", name: "Teso Broadcasting", region: "Eastern", reach: 380_000 },
  { id: "voice-tor", name: "Voice of Tororo", region: "Eastern", reach: 265_000 },

  // Western — Mbarara / Kasese / Fort Portal / Bushenyi / Kabale
  { id: "radiowest-mbr", name: "Radio West", region: "Western", reach: 905_000 },
  { id: "west-mbr", name: "West FM", region: "Western", reach: 690_000 },
  { id: "crooze-mbr", name: "Crooze FM", region: "Western", reach: 575_000 },
  { id: "voice-toro", name: "Voice of Toro", region: "Western", reach: 430_000 },
  { id: "life-kas", name: "Voice of Life", region: "Western", reach: 395_000 },
  { id: "kigezi-kab", name: "Kigezi Broadcast", region: "Western", reach: 310_000 },

  // Northern — Gulu / Lira / Arua / Kitgum
  { id: "upcountry-gul", name: "Upcountry FM", region: "Northern", reach: 520_000 },
  { id: "mega-gul", name: "Mega FM", region: "Northern", reach: 465_000 },
  { id: "kachele-gul", name: "Kachele FM", region: "Northern", reach: 350_000 },
  { id: "lango-lir", name: "Lango Broadcast", region: "Northern", reach: 305_000 },
  { id: "aru-arua", name: "Arua Hill Radio", region: "Northern", reach: 275_000 },
  { id: "border-kit", name: "Border FM", region: "Northern", reach: 190_000 },
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

export const REGION_META: Record<Region, { blurb: string; accent: string }> = {
  Central: { blurb: "Kampala metro & central corridor", accent: "#f59e0b" },
  Eastern: { blurb: "Mbale, Jinja & Teso sub-region", accent: "#10b981" },
  Western: { blurb: "Mbarara, Kasese & Ankole", accent: "#38bdf8" },
  Northern: { blurb: "Gulu, Lira & West Nile", accent: "#a78bfa" },
};
