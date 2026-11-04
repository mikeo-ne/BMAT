// Venue-operator data. Imported ONLY by components/dashboards/venue/*.
// Production: RLS restricts to venues.venue_org_id = caller's org.
export type ListenerNode = {
  id: string;
  location: string;
  type: "Bar" | "Club" | "Lounge" | "Rooftop";
  status: "online" | "degraded" | "offline";
  lastHeartbeat: string;
  tracksToday: number;
};

export const NODES: ListenerNode[] = [
  { id: "N-K01", location: "Main floor — Kololo", type: "Club", status: "online", lastHeartbeat: "12s ago", tracksToday: 142 },
  { id: "N-K02", location: "Rooftop — Kololo", type: "Rooftop", status: "online", lastHeartbeat: "8s ago", tracksToday: 96 },
  { id: "N-N01", location: "Bar — Ntinda", type: "Bar", status: "degraded", lastHeartbeat: "4m ago", tracksToday: 51 },
  { id: "N-N02", location: "Lounge — Ntinda", type: "Lounge", status: "offline", lastHeartbeat: "2h ago", tracksToday: 0 },
];

export type DjSet = { id: string; dj: string; date: string; start: string; end: string; tracks: number; matched: number };
export const DJ_SETS: DjSet[] = [
  { id: "S-1", dj: "DJ Wakiso", date: "2026-11-01", start: "22:00", end: "01:30", tracks: 58, matched: 55 },
  { id: "S-2", dj: "Selector Amani", date: "2026-11-02", start: "21:00", end: "00:00", tracks: 47, matched: 47 },
  { id: "S-3", dj: "DJ Nnaalongo", date: "2026-11-03", start: "23:00", end: "03:00", tracks: 71, matched: 63 },
];

export const COMPLIANCE = { status: "compliant" as "compliant" | "at-risk" | "non-compliant", licence: "UPRS-PP-2026-1132", renews: "2027-03-31" };
