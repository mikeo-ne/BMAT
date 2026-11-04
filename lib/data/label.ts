// Record-label data. Imported ONLY by components/dashboards/label/*.
// Production: rows filtered by RLS to recordings.label_org_id = caller's org.
export type RosterArtist = { id: string; name: string; genre: string; tracks: number; spins30d: number; whatsapp: string };

export const ROSTER: RosterArtist[] = [
  { id: "A-1", name: "Nalu Akello", genre: "Afrobeat", tracks: 14, spins30d: 2210, whatsapp: "+256 700 000 101" },
  { id: "A-2", name: "Kato Soul", genre: "R&B", tracks: 9, spins30d: 1340, whatsapp: "+256 700 000 102" },
  { id: "A-3", name: "Zawadi B", genre: "Dancehall", tracks: 6, spins30d: 870, whatsapp: "+256 700 000 103" },
];

export type CatalogueItem = { id: string; title: string; artist: string; isrc: string; upc: string; release: string; fingerprinted: boolean };

export const CATALOGUE: CatalogueItem[] = [
  { id: "R-1", title: "Kampala Nights", artist: "Nalu Akello", isrc: "UG-PSR-26-00011", upc: "196589000117", release: "2026-03-14", fingerprinted: true },
  { id: "R-2", title: "Lake Breeze", artist: "Nalu Akello", isrc: "UG-PSR-26-00012", upc: "196589000117", release: "2026-03-14", fingerprinted: true },
  { id: "R-3", title: "Masaka Groove", artist: "Kato Soul", isrc: "UG-PSR-26-00020", upc: "196589000209", release: "2026-06-02", fingerprinted: true },
  { id: "R-4", title: "Boda Love", artist: "Zawadi B", isrc: "", upc: "", release: "2026-11-20", fingerprinted: false },
];

export const LABEL_REVENUE = [
  { month: "Jun", ugx: 8_400_000 },
  { month: "Jul", ugx: 9_150_000 },
  { month: "Aug", ugx: 11_200_000 },
  { month: "Sep", ugx: 10_480_000 },
  { month: "Oct", ugx: 13_900_000 },
  { month: "Nov*", ugx: 3_100_000 },
];

export const LABEL_STATS = { artists: 3, recordings: 29, spins30d: 4420, revenueYtd: 72_600_000 };
