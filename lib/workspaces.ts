export type WorkspaceId =
  | "public"
  | "artist"
  | "broadcaster"
  | "cmo"
  | "advertiser";
export type ArtistView = "overview" | "music" | "catalogue" | "delivery";
export type ModuleId =
  | "overview"
  | "music"
  | "catalogue"
  | "delivery"
  | "alerts"
  | "charts"
  | "stats"
  | "station-overview"
  | "station-logs"
  | "ad-audit"
  | "audit"
  | "rights"
  | "royalties"
  | "regional"
  | "mix-parser";

interface Workspace {
  id: WorkspaceId;
  label: string;
  short: string;
  badge: string;
  initials: string;
  accent: string;
  href: string;
  description: string;
  modules: readonly ModuleId[];
}
interface WorkspaceModule {
  id: ModuleId;
  href: string;
  label: string;
  title: string;
  owner: WorkspaceId;
  aliases?: readonly string[];
}

/** Presentation preferences only. This matrix is not authentication, an entitlement or an API guard. */
export const WORKSPACES: readonly Workspace[] = [
  {
    id: "public",
    label: "Public Guest",
    short: "Public guest",
    badge: "Public View",
    initials: "UG",
    accent: "#cbd5e1",
    href: "/dashboard/charts",
    description: "Read-only charts and aggregate statistics",
    modules: ["charts", "stats"],
  },
  {
    id: "artist",
    label: "Artist & Label Portal",
    short: "Artist & label",
    badge: "Artist Portal",
    initials: "AL",
    accent: "#60a5fa",
    href: "/dashboard/artist",
    description: "Your catalogue, airplay and rights",
    modules: [
      "overview",
      "music",
      "catalogue",
      "delivery",
      "alerts",
      "charts",
      "regional",
      "rights",
      "royalties",
    ],
  },
  {
    id: "broadcaster",
    label: "Broadcaster Playout Log",
    short: "Broadcaster",
    badge: "Broadcaster Log",
    initials: "BR",
    accent: "#fbbf24",
    href: "/dashboard/playout",
    description: "Capture-backed playout and evidence",
    modules: [
      "station-logs",
      "station-overview",
      "charts",
      "ad-audit",
      "regional",
      "mix-parser",
      "audit",
      "music",
      "alerts",
    ],
  },
  {
    id: "cmo",
    label: "CMO & UPRS Regulatory Auditor",
    short: "CMO & UPRS",
    badge: "CMO Audit",
    initials: "CM",
    accent: "#c084fc",
    href: "/dashboard/cmo",
    description: "Transparent reporting and distributions",
    modules: [
      "audit",
      "charts",
      "royalties",
      "rights",
      "regional",
      "station-overview",
      "mix-parser",
      "music",
    ],
  },
  {
    id: "advertiser",
    label: "Advertiser Spot Tracker",
    short: "Advertiser",
    badge: "Advertiser View",
    initials: "AD",
    accent: "#fb7185",
    href: "/dashboard/advertisers",
    description: "Session-only campaign planning, clearly labelled simulation",
    modules: [
      "ad-audit",
      "charts",
      "regional",
      "station-overview",
      "music",
      "alerts",
    ],
  },
];

export const WORKSPACE_MODULES: readonly WorkspaceModule[] = [
  {
    id: "overview",
    href: "/dashboard/artist",
    label: "Dashboard overview",
    title: "Artist & Label Portal",
    owner: "artist",
  },
  {
    id: "music",
    href: "/dashboard/artists",
    label: "Artists & music",
    title: "Artists & Music Library",
    owner: "artist",
  },
  {
    id: "catalogue",
    href: "/dashboard/artist/catalogue",
    label: "My catalogue & ISRC",
    title: "My Catalogue & ISRC",
    owner: "artist",
  },
  {
    id: "delivery",
    href: "/dashboard/artist/delivery",
    label: "Deliver a master",
    title: "Master Delivery",
    owner: "artist",
  },
  {
    id: "alerts",
    href: "/dashboard/alerts",
    label: "WhatsApp & webhooks",
    title: "Live Airplay Alerts & Webhooks",
    owner: "artist",
  },
  {
    id: "charts",
    href: "/dashboard/charts",
    label: "National Top 100 charts",
    title: "National Top 100 Charts",
    owner: "public",
  },
  {
    id: "stats",
    href: "/dashboard/stats",
    label: "Public airplay statistics",
    title: "Public Airplay Statistics",
    owner: "public",
  },
  {
    id: "station-overview",
    href: "/dashboard/monitoring",
    label: "Station overview & sources",
    title: "Live Station Monitor",
    owner: "broadcaster",
  },
  {
    id: "station-logs",
    href: "/dashboard/playout",
    label: "Station playout logs",
    title: "Broadcaster Playout Log",
    owner: "broadcaster",
  },
  {
    id: "ad-audit",
    href: "/dashboard/advertisers",
    label: "Ad campaign auditor",
    title: "Advertiser Spot Tracker",
    owner: "advertiser",
  },
  {
    id: "audit",
    href: "/dashboard/cmo",
    label: "Compliance & audit ledger",
    title: "CMO & UPRS Regulatory Auditor",
    owner: "cmo",
    aliases: ["/dashboard/cmo/master", "/dashboard/east-sound"],
  },
  {
    id: "rights",
    href: "/dashboard/splits",
    label: "Rights & disputes",
    title: "Rights & Split-Sheet Management",
    owner: "artist",
  },
  {
    id: "royalties",
    href: "/dashboard/royalties",
    label: "Royalty splits & statements",
    title: "Royalties",
    owner: "cmo",
  },
  {
    id: "regional",
    href: "/dashboard/analytics/regional",
    label: "Regional airplay",
    title: "Airplay Geography & Hit Velocity",
    owner: "artist",
  },
  {
    id: "mix-parser",
    href: "/dashboard/mix-parser",
    label: "Unmatched & DJ mixes",
    title: "Unidentified Audio & DJ Mix Parser",
    owner: "broadcaster",
  },
];

export function isWorkspace(value: string | null): value is WorkspaceId {
  return WORKSPACES.some((workspace) => workspace.id === value);
}

/** Handles the optional static-site base path, trailing slashes and local deep links. */
export function dashboardPath(pathname: string): string {
  const path = pathname.split(/[?#]/)[0].replace(/\/+$/, "");
  const index = path.indexOf("/dashboard");
  return index >= 0 ? path.slice(index) : path;
}
export function moduleForPath(pathname: string): WorkspaceModule | undefined {
  const path = dashboardPath(pathname);
  return WORKSPACE_MODULES.find(
    (module) => module.href === path || module.aliases?.includes(path),
  );
}
export function modulesForWorkspace(
  role: WorkspaceId,
): readonly WorkspaceModule[] {
  const workspace = WORKSPACES.find((item) => item.id === role)!;
  return workspace.modules.map(
    (id) => WORKSPACE_MODULES.find((module) => module.id === id)!,
  );
}
export function workspaceForPath(pathname: string): WorkspaceId {
  return moduleForPath(pathname)?.owner ?? "artist";
}
/** Keep the selected view on shared modules. Direct links select a suitable view, not a privileged session. */
export function resolveWorkspace(
  pathname: string,
  preference: string | null,
): WorkspaceId {
  const activeModule = moduleForPath(pathname);
  if (
    isWorkspace(preference) &&
    (!activeModule ||
      WORKSPACES.find((item) => item.id === preference)!.modules.includes(
        activeModule.id,
      ))
  )
    return preference;
  return workspaceForPath(pathname);
}

const ARTIST_ROUTES: Record<ArtistView, string> = {
  overview: "/dashboard/artist",
  music: "/dashboard/artists",
  catalogue: "/dashboard/artist/catalogue",
  delivery: "/dashboard/artist/delivery",
};
export function artistViewForPath(pathname: string): ArtistView | null {
  const path = dashboardPath(pathname);
  return (
    (Object.keys(ARTIST_ROUTES) as ArtistView[]).find(
      (view) => ARTIST_ROUTES[view] === path,
    ) ?? null
  );
}
export function artistViewHref(view: ArtistView): string {
  return ARTIST_ROUTES[view];
}
