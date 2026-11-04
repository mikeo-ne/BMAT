import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  DEMO_ROLE_COOKIE,
  ROLES,
  ROLE_META,
  ROLE_NAV,
  isRole,
  roleForPath,
} from "@/lib/roles";

/**
 * Role routing is the first of the three isolation layers (middleware →
 * RoleGuard → RLS). If a role's landing path routes back to a different role,
 * the middleware redirects that role away from its own dashboard forever — the
 * exact class of bug that shipped twice in the previous build.
 */
describe("role definitions", () => {
  it("lists exactly the five master roles", () => {
    expect([...ROLES]).toEqual(["cmo", "label", "artist", "broadcaster", "venue"]);
  });

  it("keeps ROLES, ROLE_META and ROLE_NAV in sync", () => {
    expect(Object.keys(ROLE_META).sort()).toEqual([...ROLES].sort());
    expect(Object.keys(ROLE_NAV).sort()).toEqual([...ROLES].sort());
  });

  it("exposes a demo role cookie name", () => {
    expect(DEMO_ROLE_COOKIE).toBeTruthy();
  });
});

describe("isRole", () => {
  it.each([...ROLES])("accepts %s", (role) => {
    expect(isRole(role)).toBe(true);
  });

  it.each([
    ["admin", "a role that does not exist"],
    ["", "the empty string"],
    ["CMO", "the wrong case"],
    ["cmo ", "trailing whitespace"],
    [null, "null"],
    [undefined, "undefined"],
    [42, "a number"],
    [{ role: "cmo" }, "an object"],
    [["cmo"], "an array"],
  ])("rejects %j (%s)", (value, _why) => {
    expect(isRole(value)).toBe(false);
  });
});

describe("roleForPath", () => {
  it.each([...ROLES])("%s lands on its own dashboard", (role) => {
    expect(roleForPath(ROLE_META[role].path)).toBe(role);
  });

  it.each([...ROLES])("%s's dashboard page exists on disk", (role) => {
    expect(existsSync(`app${ROLE_META[role].path}/page.tsx`)).toBe(true);
  });

  it.each([...ROLES])("no other role's path routes into %s", (role) => {
    for (const other of ROLES.filter((r) => r !== role))
      expect(roleForPath(ROLE_META[other].path)).not.toBe(role);
  });

  it.each([...ROLES])("%s resolves for nested sub-pages", (role) => {
    expect(roleForPath(`${ROLE_META[role].path}/catalogue`)).toBe(role);
  });

  it("returns null for the bare dashboard root so middleware can redirect home", () => {
    expect(roleForPath("/dashboard")).toBeNull();
    expect(roleForPath("/dashboard/")).toBeNull();
  });

  it.each([
    "/charts",
    "/",
    "/blog",
    "/dashboard/unknown",
    "/dashboard/../cmo",
    "/elsewhere/dashboard/cmo",
  ])("returns null for %s", (path) => {
    expect(roleForPath(path)).toBeNull();
  });

  it("does not treat a differently-cased segment as a role", () => {
    expect(roleForPath("/dashboard/CMO")).toBeNull();
  });
});

describe("per-role navigation", () => {
  it.each([...ROLES])("%s navigation is non-empty and starts at overview", (role) => {
    const nav = ROLE_NAV[role];
    expect(nav.length).toBeGreaterThan(0);
    expect(nav[0].id).toBe("overview");
  });

  it.each([...ROLES])("%s has unique nav ids and no blank labels", (role) => {
    const nav = ROLE_NAV[role];
    const ids = nav.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const item of nav) {
      expect(item.id.trim()).not.toBe("");
      expect(item.label.trim()).not.toBe("");
    }
  });

  it("gives the CMO auditor the universal sections", () => {
    const ids = ROLE_NAV.cmo.map((item) => item.id);
    expect(ids).toEqual(
      expect.arrayContaining(["registry", "splits", "top100", "heatmap", "disputes", "unmatched"]),
    );
  });

  it("does not leak the CMO's audit sections into an artist workspace", () => {
    const artistIds = ROLE_NAV.artist.map((item) => item.id);
    for (const cmoOnly of ["registry", "disputes", "unmatched", "heatmap"])
      expect(artistIds).not.toContain(cmoOnly);
  });

  it("does not leak broadcaster ad-control into a venue workspace", () => {
    const venueIds = ROLE_NAV.venue.map((item) => item.id);
    expect(venueIds).not.toContain("adcontrol");
    expect(venueIds).not.toContain("cuesheet");
  });
});
