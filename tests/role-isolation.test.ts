import { existsSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  PRIVATE_ROUTES,
  PUBLIC_DASHBOARD_ROUTES,
  ROLE_HOME,
  roleMayOpen,
  safeReturnPath,
  type AccountRole,
} from "@/lib/auth-types";
import { isolateWorkspace } from "@/lib/access-data";
import { buildSeedTracks } from "@/lib/catalog";
import type { BroadcastSpin } from "@/lib/playout";
import type { SessionUser } from "@/lib/auth-types";
import { WORKSPACES, modulesForWorkspace } from "@/lib/workspaces";

const ROLES: AccountRole[] = ["artist", "label", "broadcaster", "cmo", "venue"];

function user(role: AccountRole, stationIds: string[] = []): SessionUser {
  return {
    id: `user-${role}`,
    role,
    email: `${role}@example.com`,
    name: role,
    mock: false,
    stationIds,
  };
}

describe("every role can reach its own landing page", () => {
  // A role whose home page denies that role redirects to itself forever.
  it.each(ROLES)("%s home is permitted by its own route map", (role) => {
    expect(roleMayOpen(role, ROLE_HOME[role])).toBe(true);
  });

  it.each(ROLES)("%s landing page exists on disk", (role) => {
    expect(existsSync(`app${ROLE_HOME[role]}/page.tsx`)).toBe(true);
  });

  it.each(ROLES)("%s keeps its own safe return path", (role) => {
    expect(safeReturnPath(ROLE_HOME[role], role)).toBe(ROLE_HOME[role]);
  });

  it.each(WORKSPACES)(
    "$label module links stay inside routes its role may open",
    (workspace) => {
      if (workspace.id === "advertiser") return;
      for (const entry of modulesForWorkspace(workspace.id))
        expect(
          roleMayOpen(workspace.id, entry.href),
          `${workspace.id} → ${entry.href}`,
        ).toBe(true);
    },
  );
});

describe("role maps cannot leak another role's workspace", () => {
  it.each(ROLES)("%s never lists a route outside the shared catalogue", (role) => {
    for (const path of PRIVATE_ROUTES[role]) {
      expect(
        path.startsWith("/dashboard/"),
        `${role} → ${path}`,
      ).toBe(true);
    }
  });

  it("venue operators cannot open broadcaster-only station routes", () => {
    for (const path of ["/dashboard/playout", "/dashboard/monitoring"])
      expect(roleMayOpen("venue", path)).toBe(false);
  });

  it("venue operators cannot open label, artist or CMO routes", () => {
    for (const path of [
      "/dashboard/artists",
      "/dashboard/artist",
      "/dashboard/cmo",
      "/dashboard/royalties",
    ])
      expect(roleMayOpen("venue", path)).toBe(false);
  });

  it("a venue return path cannot be smuggled into another workspace", () => {
    expect(safeReturnPath("/dashboard/cmo", "venue")).toBe(ROLE_HOME.venue);
  });

  it("public guests may only open public dashboard routes", () => {
    for (const path of PUBLIC_DASHBOARD_ROUTES)
      expect(roleMayOpen("public", path)).toBe(true);
    expect(roleMayOpen("public", ROLE_HOME.venue)).toBe(false);
  });
});

describe("venue playout isolation", () => {
  const tracks = buildSeedTracks();
  const spins = [
    {
      id: "spin-1",
      detectedAt: new Date().toISOString(),
      stationId: "UG-VEN-001",
      stationName: "Cayenne Lounge",
      region: "Central",
      medium: "FM",
      trackId: tracks[0]?.id ?? null,
      title: "Owned track",
      primaryArtist: "Artist",
      isrc: null,
      durationSec: 210,
      confidence: 99,
      source: "demo",
    },
    {
      id: "spin-2",
      detectedAt: new Date().toISOString(),
      stationId: "UG-FM-999",
      stationName: "Another Station",
      region: "Central",
      medium: "FM",
      trackId: tracks[0]?.id ?? null,
      title: "Other station track",
      primaryArtist: "Artist",
      isrc: null,
      durationSec: 200,
      confidence: 98,
      source: "demo",
    },
  ] as BroadcastSpin[];

  it("shows only the operator's own node activity", () => {
    const scoped = isolateWorkspace(tracks, spins, user("venue", ["UG-VEN-001"]));
    expect(scoped.history.map((spin) => spin.id)).toEqual(["spin-1"]);
  });

  it("never receives the universal catalogue", () => {
    const scoped = isolateWorkspace(tracks, spins, user("venue", ["UG-VEN-001"]));
    expect(scoped.tracks).toEqual([]);
  });

  it("sees nothing without an assigned node", () => {
    const scoped = isolateWorkspace(tracks, spins, user("venue"));
    expect(scoped.history).toEqual([]);
    expect(scoped.tracks).toEqual([]);
  });

  it("still gives the CMO auditor universal visibility", () => {
    const scoped = isolateWorkspace(tracks, spins, user("cmo"));
    expect(scoped.history).toHaveLength(spins.length);
    expect(scoped.tracks.length).toBeGreaterThan(0);
  });
});
