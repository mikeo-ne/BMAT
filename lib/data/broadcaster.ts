// Broadcaster data. Imported ONLY by components/dashboards/broadcaster/*.
// Production: RLS restricts to stations.broadcaster_org_id = caller's org.
import { seeded } from "../safe";

export type SegmentKind = "music" | "ad" | "talk";
export type Segment = { start: number; end: number; kind: SegmentKind; label: string; composer?: string; publisher?: string; isrc?: string };

const SONGS = [
  { label: "Kampala Nights — Nalu Akello", composer: "N. Akello", publisher: "Pearl Sound Publishing", isrc: "UG-PSR-26-00011" },
  { label: "Ekitiibwa — Mutebi X", composer: "R. Mutebi", publisher: "Kasubi Music", isrc: "UG-KSM-24-00290" },
  { label: "Boda Love — Zawadi B", composer: "Z. Birungi", publisher: "Pearl Sound Publishing", isrc: "UG-PSR-26-00031" },
  { label: "Nile Fever — Okello Prime", composer: "D. Okello", publisher: "Nile Beats Ltd", isrc: "UG-NBL-26-00102" },
  { label: "Masaka Groove — Kato Soul", composer: "K. Ssali", publisher: "Pearl Sound Publishing", isrc: "UG-PSR-26-00020" },
];
const ADS = ["Telecom spot 30s", "Beverage spot 45s", "Bank spot 30s", "Detergent spot 15s"];
const TALK = ["News bulletin", "Breakfast show", "Sports desk", "Call-in segment"];

/** 24-hour playout log in minutes-from-midnight. */
export const PLAYOUT: Segment[] = (() => {
  const r = seeded(505);
  const out: Segment[] = [];
  let t = 0;
  while (t < 1440) {
    const p = r();
    const kind: SegmentKind = p < 0.66 ? "music" : p < 0.88 ? "ad" : "talk";
    const len = kind === "music" ? 3 + Math.floor(r() * 3) : kind === "ad" ? 1 + Math.floor(r() * 2) : 4 + Math.floor(r() * 9);
    const end = Math.min(1440, t + len);
    if (kind === "music") out.push({ start: t, end, kind, ...SONGS[Math.floor(r() * SONGS.length)] });
    else out.push({ start: t, end, kind, label: (kind === "ad" ? ADS : TALK)[Math.floor(r() * 4)] });
    t = end;
  }
  return out;
})();

export type AdBooking = { id: string; advertiser: string; spot: string; booked: number; aired: number; daypart: string };
export const AD_BOOKINGS: AdBooking[] = [
  { id: "AD-11", advertiser: "Telecom Co.", spot: "Data bundle 30s", booked: 24, aired: 24, daypart: "06:00–10:00" },
  { id: "AD-12", advertiser: "Beverage Ltd", spot: "Weekend promo 45s", booked: 18, aired: 15, daypart: "16:00–20:00" },
  { id: "AD-13", advertiser: "Uganda Bank", spot: "Savings 30s", booked: 12, aired: 13, daypart: "All day" },
  { id: "AD-14", advertiser: "CleanHome", spot: "Detergent 15s", booked: 30, aired: 22, daypart: "10:00–14:00" },
];

export const STATION = { name: "Your Station · 91.3 FM", licence: "UPRS-BR-2026-0418" };
