export type SecurityRole = "public" | "artist" | "broadcaster" | "cmo";
export type AccountRole = Exclude<SecurityRole, "public">;
export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: AccountRole;
  stationIds: string[];
  mock: boolean;
}
export interface BrowserSession {
  user: SessionUser | null;
  csrfToken: string | null;
  expiresAt: string | null;
}
export const ROLE_LABELS: Record<SecurityRole, string> = {
  public: "Public Guest",
  artist: "Artist / Label Manager",
  broadcaster: "Broadcaster / Station Manager",
  cmo: "CMO Auditor",
};
export const ROLE_HOME: Record<SecurityRole, string> = {
  public: "/dashboard/charts",
  artist: "/dashboard/artist",
  broadcaster: "/dashboard/playout",
  cmo: "/dashboard/cmo",
};
const PUBLIC = ["/dashboard/charts", "/dashboard/stats"];
const PRIVATE: Record<AccountRole, string[]> = {
  artist: [
    "/dashboard/artist",
    "/dashboard/artists",
    "/dashboard/artist/catalogue",
    "/dashboard/artist/delivery",
    "/dashboard/alerts",
    "/dashboard/analytics/regional",
    "/dashboard/splits",
  ],
  broadcaster: [
    "/dashboard/playout",
    "/dashboard/monitoring",
    "/dashboard/reportal",
    "/dashboard/advertisers",
  ],
  cmo: [
    "/dashboard/cmo",
    "/dashboard/cmo/master",
    "/dashboard/east-sound",
    "/dashboard/royalties",
    "/dashboard/splits",
    "/dashboard/mix-parser",
  ],
};
export function roleMayOpen(role: SecurityRole, pathname: string): boolean {
  const raw = pathname.split(/[?#]/)[0].replace(/\/+$/, "");
  const index = raw.indexOf("/dashboard");
  const path = index < 0 ? raw : raw.slice(index);
  return (
    PUBLIC.includes(path) || (role !== "public" && PRIVATE[role].includes(path))
  );
}
export function safeReturnPath(
  value: string | null,
  role: SecurityRole,
): string {
  if (
    !value ||
    !value.startsWith("/dashboard/") ||
    /[\\\r\n]/.test(value) ||
    !roleMayOpen(role, value)
  )
    return ROLE_HOME[role];
  return value;
}

/** Binds already-authorized client snapshots to the server identity and its assignments. */
export function sessionScope(user: SessionUser | null): string {
  return user
    ? JSON.stringify([user.id, user.role, [...user.stationIds].sort()])
    : "public";
}
