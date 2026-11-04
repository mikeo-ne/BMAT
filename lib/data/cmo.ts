// CMO / Auditor data. Imported ONLY by components/dashboards/cmo/*.
// In production these come from Supabase tables guarded by RLS (role = 'cmo').
import { seeded } from "../safe";

export type Work = {
  id: string;
  title: string;
  owner: string;
  isrc: string;
  iswc: string;
  status: "Registered" | "Pending" | "Conflict";
};

const TITLES = ["Kampala Nights", "Sente Zange", "Boda Love", "Nyabo Wange", "Owino Drip", "Mpola Mpola", "Lake Breeze", "Kikadde", "Ntinda Anthem", "Gulu Gold", "Rwenzori Rain", "Mbale Sunrise", "Jinja Flow", "Ekitiibwa", "Masaka Groove", "Nile Fever"];
const OWNERS = ["Pearl Sound Records", "Nile Beats Ltd", "Independent — Nalu Akello", "Kasubi Music", "Independent — Okello Prime", "Rwenzori Records"];

export const REGISTRY: Work[] = (() => {
  const r = seeded(101);
  return TITLES.map((title, i) => ({
    id: `W-${1000 + i}`,
    title,
    owner: OWNERS[Math.floor(r() * OWNERS.length)],
    isrc: `UG-ES1-26-${String(10000 + Math.floor(r() * 89999)).slice(0, 5)}`,
    iswc: `T-${String(Math.floor(r() * 1e9)).padStart(9, "0")}-${i % 10}`,
    status: r() > 0.85 ? "Conflict" : r() > 0.7 ? "Pending" : "Registered",
  }));
})();

export const TOP100 = (() => {
  const r = seeded(202);
  let spins = 1400;
  return Array.from({ length: 100 }, (_, i) => {
    spins -= Math.floor(r() * 14);
    return {
      rank: i + 1,
      title: `${TITLES[i % TITLES.length]}${i >= TITLES.length ? ` (${["Remix", "Live", "Acoustic", "ft. Kato Soul", "Extended", "Radio Edit"][Math.floor(i / TITLES.length) % 6]})` : ""}`,
      owner: OWNERS[Math.floor(r() * OWNERS.length)],
      spins: Math.max(spins, 12),
      stations: 4 + Math.floor(r() * 28),
    };
  });
})();

export const HEAT_REGIONS = ["Central", "Western", "Eastern", "Northern"] as const;
export const HEAT_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
/** detections per region per day-part (4 regions × 7 days × 6 four-hour blocks) */
export const HEATMAP: number[][][] = (() => {
  const r = seeded(303);
  return HEAT_REGIONS.map((_, ri) =>
    HEAT_DAYS.map((_, di) =>
      Array.from({ length: 6 }, (_, b) => {
        const peak = b === 2 || b === 4 ? 1.6 : b === 0 ? 0.3 : 1;
        const weekend = di >= 4 ? 1.3 : 1;
        return Math.round((ri === 0 ? 220 : 90) * peak * weekend * (0.6 + r() * 0.8));
      }),
    ),
  );
})();

export type Dispute = {
  id: string;
  work: string;
  claimantA: string;
  claimantB: string;
  shareA: number;
  shareB: number;
  spinsAtStake: number;
  opened: string;
  status: "Open" | "Resolved: A" | "Resolved: B" | "Resolved: Split" | "Escalated";
};

export const DISPUTES: Dispute[] = [
  { id: "D-301", work: "Nile Fever", claimantA: "Nile Beats Ltd", claimantB: "Kasubi Music", shareA: 100, shareB: 100, spinsAtStake: 412, opened: "2026-10-18", status: "Open" },
  { id: "D-302", work: "Owino Drip", claimantA: "Independent — Okello Prime", claimantB: "Pearl Sound Records", shareA: 60, shareB: 70, spinsAtStake: 228, opened: "2026-10-22", status: "Open" },
  { id: "D-303", work: "Kikadde", claimantA: "Rwenzori Records", claimantB: "Kasubi Music", shareA: 50, shareB: 50, spinsAtStake: 96, opened: "2026-10-29", status: "Open" },
  { id: "D-304", work: "Lake Breeze", claimantA: "Pearl Sound Records", claimantB: "Nile Beats Ltd", shareA: 100, shareB: 40, spinsAtStake: 51, opened: "2026-11-01", status: "Open" },
];

export type Unmatched = { id: string; station: string; heardAt: string; duration: number; confidence: number; seed: number };

export const UNMATCHED: Unmatched[] = (() => {
  const r = seeded(404);
  const stations = ["Capital FM", "CBS FM", "NBS TV", "Radio West", "Mega FM", "Voice of Teso", "Venue node · Kololo"];
  return Array.from({ length: 8 }, (_, i) => ({
    id: `U-${7700 + i}`,
    station: stations[Math.floor(r() * stations.length)],
    heardAt: `2026-11-0${1 + (i % 4)} ${String(6 + Math.floor(r() * 16)).padStart(2, "0")}:${String(Math.floor(r() * 60)).padStart(2, "0")}`,
    duration: 120 + Math.floor(r() * 140),
    confidence: Math.round(20 + r() * 50),
    seed: 900 + i,
  }));
})();

export const CMO_STATS = { detections24h: 18432, matchedRate: 94.2, openDisputes: 4, unmatched: 8 };
