export type WorkspaceId = "artist" | "broadcaster" | "cmo" | "advertiser";

export const WORKSPACES = [
  {
    id: "artist",
    label: "Artist & Label Portal",
    short: "Artist & label",
    href: "/dashboard/artist",
    description: "Your catalogue, airplay and rights",
  },
  {
    id: "broadcaster",
    label: "Broadcaster Playout Log",
    short: "Broadcaster",
    href: "/dashboard/playout",
    description: "Capture-backed playout and evidence",
  },
  {
    id: "cmo",
    label: "CMO & UPRS Regulatory Auditor",
    short: "CMO & UPRS",
    href: "/dashboard/cmo",
    description: "Transparent reporting and distributions",
  },
  {
    id: "advertiser",
    label: "Advertiser Spot Tracker",
    short: "Advertiser",
    href: "/dashboard/advertisers",
    description: "Every booked spot, accounted for",
  },
] as const;

export function isWorkspace(value: string | null): value is WorkspaceId {
  return WORKSPACES.some((workspace) => workspace.id === value);
}

export function workspaceForPath(pathname: string): WorkspaceId {
  if (pathname === "/dashboard/cmo") return "cmo";
  if (pathname === "/dashboard/advertisers") return "advertiser";
  if (
    [
      "/dashboard/playout",
      "/dashboard/monitoring",
      "/dashboard/mix-parser",
    ].includes(pathname)
  )
    return "broadcaster";
  return "artist";
}
