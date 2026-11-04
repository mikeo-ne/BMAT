import { describe, expect, it, vi } from "vitest";
import Canonical, { metadata } from "@/app/dashboard/cmo/page";
import * as Master from "@/app/dashboard/cmo/master/page";
import * as Legacy from "@/app/dashboard/east-sound/page";
import CompatibilityModule from "@/components/east-sound-master";
import { CmoAuditWorkspace } from "@/components/cmo-audit-workspace";
import { workspaceForPath } from "@/lib/workspaces";

vi.mock("@/components/cmo-audit-workspace", () => ({
  CmoAuditWorkspace: vi.fn(() => null),
}));

describe("legacy compliance bookmarks cannot restore fabricated billing or infringements", () => {
  it.each([Master, Legacy])(
    "shares the exact capture-backed workspace and honest metadata",
    (alias) => {
      expect(alias.default).toBe(Canonical);
      expect(alias.default).toBe(CmoAuditWorkspace);
      expect(alias.metadata).toBe(metadata);
      expect(alias.dynamic).toBe("force-dynamic");
    },
  );
  it("keeps the historical component import bound to the same server workspace", () => {
    expect(CompatibilityModule).toBe(CmoAuditWorkspace);
  });
  it("selects the CMO role for both bookmarks, including static-export trailing slashes", () => {
    for (const route of ["/dashboard/cmo/master", "/dashboard/east-sound"])
      for (const suffix of ["", "/"])
        expect(workspaceForPath(route + suffix)).toBe("cmo");
  });
});
