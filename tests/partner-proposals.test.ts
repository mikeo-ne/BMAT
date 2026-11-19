import { describe, expect, it } from "vitest";
import { PARTNERS } from "@/lib/partner-proposals";

describe("partner proposals", () => {
  it("covers the guide's principal institutional and industry partners", () => {
    expect(PARTNERS.map((p) => p.id)).toEqual(["ursb", "uprs", "ucc", "unmf", "broadcasters", "distributors", "venues", "creators"]);
  });
  it("has a sourced goal, practical ask and explicit boundary for every proposal", () => {
    expect(new Set(PARTNERS.map((p) => p.id)).size).toBe(PARTNERS.length);
    for (const p of PARTNERS) {
      expect(p.priority.length).toBeGreaterThan(30);
      expect(p.offer.length).toBeGreaterThan(30);
      expect(p.ask.length).toBeGreaterThan(30);
      expect(p.boundary.length).toBeGreaterThan(30);
      expect(p.sources.length).toBeGreaterThan(0);
      p.sources.forEach((source) => expect(new URL(source.url).protocol).toBe("https:"));
    }
  });
});
