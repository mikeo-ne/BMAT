// Single-artist data. Imported ONLY by components/dashboards/artist/*.
// Production: RLS restricts to recordings.artist_profile_id = auth.uid().
export type Track = { id: string; title: string; year: number; isrc: string; spins30d: number; trend: number };

export const DISCOGRAPHY: Track[] = [
  { id: "T-1", title: "Gulu Gold", year: 2026, isrc: "UG-IND-26-00401", spins30d: 640, trend: 18 },
  { id: "T-2", title: "Rwenzori Rain", year: 2025, isrc: "UG-IND-25-00377", spins30d: 210, trend: -4 },
  { id: "T-3", title: "Mbale Sunrise", year: 2025, isrc: "UG-IND-25-00376", spins30d: 155, trend: 2 },
  { id: "T-4", title: "Ekitiibwa", year: 2024, isrc: "UG-IND-24-00290", spins30d: 88, trend: -9 },
];

/** Daily spins over the last 14 days for the lead single. */
export const VELOCITY = [12, 15, 14, 19, 24, 22, 31, 35, 33, 41, 46, 44, 52, 58];

export const SPLITS = [
  { work: "Gulu Gold", party: "You (Writer/Performer)", share: 60 },
  { work: "Gulu Gold", party: "Producer — Beats by Opio", share: 25 },
  { work: "Gulu Gold", party: "Co-writer — A. Nakato", share: 15 },
  { work: "Rwenzori Rain", party: "You (Writer/Performer)", share: 80 },
  { work: "Rwenzori Rain", party: "Producer — Beats by Opio", share: 20 },
];

export const ARTIST_STATS = { tracks: 4, spins30d: 1093, stations: 17, estRoyaltyUgx: 1_840_000 };
