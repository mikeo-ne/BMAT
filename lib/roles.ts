// Single source of truth for roles, routes and per-role navigation.
// Every dashboard menu is derived from ROLE_NAV[role] ONLY — there is no
// shared/global menu, so one role's sections can never render in another's.

export const ROLES = ["cmo", "label", "artist", "broadcaster", "venue"] as const;
export type Role = (typeof ROLES)[number];

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export const ROLE_META: Record<Role, { label: string; useCase: string; path: string; blurb: string }> = {
  cmo: {
    label: "CMO / Auditor",
    useCase: "For CMOs",
    path: "/dashboard/cmo",
    blurb: "Universal registry, splits, disputes and national airplay audit.",
  },
  label: {
    label: "Record Label",
    useCase: "For Labels",
    path: "/dashboard/label",
    blurb: "Roster, masters, ISRC/UPC catalogue and label revenue.",
  },
  artist: {
    label: "Independent Artist",
    useCase: "For Artists",
    path: "/dashboard/artist",
    blurb: "Upload your songs, then track plays, spin velocity and splits.",
  },
  broadcaster: {
    label: "Broadcaster",
    useCase: "For Broadcasters",
    path: "/dashboard/broadcaster",
    blurb: "Playout timeline, UPRS cue sheets and ad control.",
  },
  venue: {
    label: "Venue Operator",
    useCase: "For Venues",
    path: "/dashboard/venue",
    blurb: "Listener nodes, UPRS compliance and DJ set logs.",
  },
};

export type NavItem = { id: string; label: string };

export const ROLE_NAV: Record<Role, NavItem[]> = {
  cmo: [
    { id: "overview", label: "Overview" },
    { id: "monthly-pack", label: "Distribution Pack" },
    { id: "registry", label: "Master Catalogue Registry" },
    { id: "splits", label: "Split Sheet Calculator" },
    { id: "top100", label: "National Top 100" },
    { id: "heatmap", label: "Regional Heatmap" },
    { id: "disputes", label: "Rights & Disputes" },
    { id: "unmatched", label: "Unmatched Audio Queue" },
    { id: "mentions", label: "Brand Mentions" },
  ],
  label: [
    { id: "overview", label: "Overview" },
    { id: "roster", label: "Artist Roster" },
    { id: "dropzone", label: "Upload Songs" },
    { id: "catalogue", label: "Catalogue" },
    { id: "revenue", label: "Label Revenue" },
    { id: "alerts", label: "Airplay Alerts" },
  ],
  artist: [
    { id: "overview", label: "Overview" },
    { id: "songs", label: "My Songs" },
    { id: "discography", label: "Discography" },
    { id: "velocity", label: "Spin Velocity" },
    { id: "splits", label: "Split Summary" },
    { id: "alerts", label: "Airplay Alerts" },
  ],
  broadcaster: [
    { id: "overview", label: "Overview" },
    { id: "timeline", label: "Playout Timeline" },
    { id: "cuesheet", label: "UPRS Cue Sheet" },
    { id: "adcontrol", label: "Ad Control Auditor" },
    { id: "mentions", label: "Brand Mentions" },
  ],
  venue: [
    { id: "overview", label: "Compliance" },
    { id: "nodes", label: "Listener Nodes" },
    { id: "djsets", label: "DJ Set Logs" },
  ],
};

/** Map a /dashboard/<segment> pathname to the role that owns it. */
export function roleForPath(pathname: string): Role | null {
  const seg = pathname.split("/")[2];
  return isRole(seg) ? seg : null;
}

export const DEMO_ROLE_COOKIE = "est_demo_role";
