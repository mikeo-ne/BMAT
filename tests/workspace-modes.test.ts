import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  WORKSPACES,
  WORKSPACE_MODULES,
  artistViewForPath,
  artistViewHref,
  dashboardPath,
  isWorkspace,
  moduleForPath,
  modulesForWorkspace,
  resolveWorkspace,
  workspaceForPath,
} from "@/lib/workspaces";

describe("role-scoped navigation is a view preference, not authorization", () => {
  it("adds Public Guest and the five master-schema specialist views", () => {
    expect(WORKSPACES.map((row) => row.id)).toEqual([
      "public",
      "artist",
      "broadcaster",
      "cmo",
      "label",
      "venue",
      "advertiser",
    ]);
    expect(isWorkspace("public")).toBe(true);
    for (const invalid of [null, "admin", "constructor", "", "Artist"])
      expect(isWorkspace(invalid)).toBe(false);
  });
  it("gives the public view only charts and aggregate statistics", () => {
    expect(modulesForWorkspace("public").map((row) => row.href)).toEqual([
      "/dashboard/charts",
      "/dashboard/stats",
    ]);
  });
  it.each(WORKSPACES)(
    "$label has a supported landing page and national charts",
    (workspace) => {
      const modules = modulesForWorkspace(workspace.id);
      expect(modules.some((row) => row.href === workspace.href)).toBe(true);
      expect(modules.some((row) => row.id === "charts")).toBe(true);
      expect(new Set(modules.map((row) => row.id)).size).toBe(modules.length);
      expect(modules.every(Boolean)).toBe(true);
      expect(resolveWorkspace(workspace.href, workspace.id)).toBe(workspace.id);
    },
  );
  it.each(WORKSPACE_MODULES)(
    "$id points at a real page, including legacy aliases",
    (item) => {
      for (const path of [item.href, ...(item.aliases ?? [])]) {
        expect(existsSync(`app${path}/page.tsx`), path).toBe(true);
        expect(moduleForPath(path)?.id).toBe(item.id);
        expect(moduleForPath(`/BMAT${path}/?from=nav#details`)?.title).toBe(
          item.title,
        );
      }
    },
  );
  it("normalises static prefixes, query strings, hashes and trailing slashes", () => {
    expect(
      dashboardPath("/BMAT/dashboard/artist/delivery/?draft=yes#file"),
    ).toBe("/dashboard/artist/delivery");
    expect(moduleForPath("/dashboard/artists")?.id).toBe("music");
    expect(moduleForPath("/dashboard/artist/catalogue")?.id).toBe("catalogue");
    expect(moduleForPath("/dashboard/artist-not-a-module")).toBeUndefined();
  });
  it.each(WORKSPACES)("keeps $id on shared national charts", ({ id }) => {
    expect(resolveWorkspace("/dashboard/charts/", id)).toBe(id);
  });
  it("keeps compatible selections on shared modules instead of overriding them with the owner", () => {
    expect(resolveWorkspace("/dashboard/advertisers", "broadcaster")).toBe(
      "broadcaster",
    );
    expect(resolveWorkspace("/dashboard/artists", "cmo")).toBe("cmo");
    expect(resolveWorkspace("/dashboard/royalties", "artist")).toBe("artist");
    expect(resolveWorkspace("/dashboard/monitoring", "advertiser")).toBe(
      "advertiser",
    );
  });
  it("chooses a suitable view for direct links but never claims the view is a protected session", () => {
    expect(resolveWorkspace("/dashboard/cmo/master/", "public")).toBe("cmo");
    expect(resolveWorkspace("/dashboard/playout", "public")).toBe(
      "broadcaster",
    );
    expect(resolveWorkspace("/dashboard/artist/delivery", "cmo")).toBe(
      "artist",
    );
    expect(resolveWorkspace("/dashboard/stats", "artist")).toBe("public");
    expect(workspaceForPath("/dashboard/east-sound")).toBe("cmo");
    expect(workspaceForPath("/dashboard/charts")).toBe("public");
  });
  it.each(["overview", "music", "catalogue", "delivery"] as const)(
    "round-trips the reloadable %s artist tab",
    (view) => {
      expect(artistViewForPath(artistViewHref(view))).toBe(view);
      expect(
        artistViewForPath(
          `/BMAT${artistViewHref(view)}/?draft=1#artist=baranga`,
        ),
      ).toBe(view);
    },
  );
  it("does not treat unrelated modules or legacy CMO routes as artist tabs", () => {
    expect(artistViewForPath("/dashboard/alerts")).toBeNull();
    expect(artistViewForPath("/dashboard/cmo/master")).toBeNull();
  });
});
