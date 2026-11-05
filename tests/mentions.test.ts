import { describe, expect, it } from "vitest";

import { aliasToLearn, mentionCounts, parseTerms, type Mention, type TrackedBrand } from "@/lib/mentions";
import { ROLE_NAV, ROLES } from "@/lib/roles";

const m = (brand: string, status: Mention["status"] = "unreviewed", heard = brand.toLowerCase()): Mention => ({
  id: Math.random().toString(36).slice(2), station: "Test FM", brand, heard, transcript: `brought to you by ${brand}`,
  heardAt: "2026-11-05T09:00:00Z", score: 100, status, evidencePath: null,
});
const mtn: TrackedBrand = { id: "b1", brand: "MTN", terms: ["mtn", "m t n"], aliases: ["mt and"], active: true };
const stanbic: TrackedBrand = { id: "b2", brand: "Stanbic Bank", terms: ["stanbic", "stanbic bank"], aliases: [], active: true };

describe("brand mention helpers", () => {
  it("counts mentions per brand, most first, ignoring rejected ones", () => {
    expect(mentionCounts([m("MTN"), m("Airtel"), m("MTN"), m("MTN", "rejected"), m("Airtel", "confirmed"), m("Coke")])).toEqual([
      { brand: "MTN", count: 2 }, { brand: "Airtel", count: 2 }, { brand: "Coke", count: 1 },
    ].sort((a, b) => b.count - a.count || a.brand.localeCompare(b.brand)));
    expect(mentionCounts(null)).toEqual([]);
  });

  it("cleans the spoken forms a CMO types", () => {
    expect(parseTerms(" MTN, m t n ,\nEm Tee En | mtn ,, ")).toEqual(["mtn", "m t n", "em tee en"]);
    expect(parseTerms("Coca-Cola, coke!")).toEqual(["coca-cola", "coke"]);
    expect(parseTerms(Array.from({ length: 30 }, (_, i) => `term ${i}`).join(","))).toHaveLength(20);
  });

  it("learns a misheard spelling only when it is new and long enough to be safe", () => {
    expect(aliasToLearn(m("Stanbic Bank", "confirmed", "stambic bank"), stanbic)).toBe("stambic bank");
    expect(aliasToLearn(m("Stanbic Bank", "confirmed", "stanbic"), stanbic)).toBeNull(); // already known
    expect(aliasToLearn(m("MTN", "confirmed", "mt and"), mtn)).toBeNull(); // already an alias
    expect(aliasToLearn(m("MTN", "confirmed", "m tn"), mtn)).toBeNull(); // too short to be safe
    expect(aliasToLearn(m("MTN", "confirmed", "emtee n"), undefined)).toBeNull(); // brand no longer tracked
  });
});

describe("brand mentions navigation", () => {
  it("appears only for the CMO and broadcasters", () => {
    for (const role of ROLES) {
      const has = ROLE_NAV[role].some((n) => n.id === "mentions");
      expect(has, role).toBe(role === "cmo" || role === "broadcaster");
    }
  });
});
