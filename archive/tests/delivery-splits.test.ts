import { describe, expect, it } from "vitest";
import {
  clearApprovals,
  createDeliveryParties,
  parseDeliveryOwnership,
  rightsTotals,
  validateDeliveryParties,
} from "@/lib/delivery-splits";
import { buildFixtureTracks as buildSeedTracks } from "@/tests/fixtures/catalogue";
import { sharesFor } from "@/lib/uprs";
import { buildSplitSheet } from "@/lib/splits";
const NOW = new Date("2026-11-01T12:00:00Z");
function signed() {
  return createDeliveryParties("QA Artist Alpha").map((party) => ({
    ...party,
    signature: { typedName: party.name, signedAt: NOW.toISOString() },
  }));
}

describe("pre-delivery ownership approvals", () => {
  it("treats all three rights pools separately and requires approvals", () => {
    const parties = createDeliveryParties("QA Artist Alpha");
    expect(rightsTotals(parties)).toEqual({
      master: 100,
      performance: 100,
      mechanical: 100,
    });
    expect(validateDeliveryParties(parties, false, NOW)).toEqual([]);
    expect(validateDeliveryParties(parties, true, NOW).join(" ")).toMatch(
      /approval/,
    );
    expect(validateDeliveryParties(signed(), true, NOW)).toEqual([]);
  });
  it("rejects overflow, under-allocation, invalid numbers and duplicate collaborators", () => {
    const parties = signed();
    expect(
      validateDeliveryParties(
        [
          {
            ...parties[0],
            shares: { master: 100, performance: 101, mechanical: 100 },
          },
        ],
        true,
        NOW,
      ).join(" "),
    ).toMatch(/between 0 and 100/);
    expect(
      validateDeliveryParties(
        [
          {
            ...parties[0],
            shares: { master: 100, performance: 99, mechanical: 100 },
          },
        ],
        true,
        NOW,
      ).join(" "),
    ).toMatch(/Performance rights must total exactly 100/);
    expect(
      validateDeliveryParties(
        [
          {
            ...parties[0],
            shares: { master: NaN, performance: 100, mechanical: 100 },
          },
        ],
        true,
        NOW,
      ).length,
    ).toBeGreaterThan(0);
    expect(
      validateDeliveryParties(
        [parties[0], { ...parties[0], id: "copy" }],
        true,
        NOW,
      ).join(" "),
    ).toMatch(/once/);
    expect(
      validateDeliveryParties([parties[0], parties[0]], true, NOW).join(" "),
    ).toMatch(/unique/);
  });
  it("rejects missing names, roles, invalid signatures and future timestamps", () => {
    expect(
      validateDeliveryParties([{ ...signed()[0], name: "" }], true, NOW).length,
    ).toBeGreaterThan(0);
    expect(
      validateDeliveryParties(
        [{ ...signed()[0], role: "not-a-role" }],
        true,
        NOW,
      ).join(" "),
    ).toMatch(/valid collaborator role/);
    expect(
      validateDeliveryParties(
        [
          {
            ...signed()[0],
            signature: {
              typedName: "Somebody else",
              signedAt: NOW.toISOString(),
            },
          },
        ],
        true,
        NOW,
      ).join(" "),
    ).toMatch(/matching/);
    expect(
      validateDeliveryParties(
        [
          {
            ...signed()[0],
            signature: { typedName: "QA Artist Alpha", signedAt: "2099-01-01" },
          },
        ],
        true,
        NOW,
      ).length,
    ).toBeGreaterThan(0);
  });
  it("clears every approval after an agreement edit", () => {
    const original = signed();
    expect(
      clearApprovals(original).every((party) => party.signature === null),
    ).toBe(true);
    expect(original[0].signature).not.toBeNull();
  });
  it("rejects malformed ownership payloads on the server", () => {
    expect(parseDeliveryOwnership(null).ownership).toBeNull();
    expect(
      parseDeliveryOwnership({
        version: 2,
        approvalMethod: "local-acknowledgement",
        parties: signed(),
      }).ownership,
    ).toBeNull();
    expect(
      parseDeliveryOwnership({
        version: 1,
        approvalMethod: "local-acknowledgement",
        parties: signed(),
      }).ownership?.parties[0].name,
    ).toBe("QA Artist Alpha");
  });
  it("uses delivered performance shares for the ledger and master shares for ownership", () => {
    const parties = [
      {
        ...signed()[0],
        shares: { master: 80, performance: 30, mechanical: 25 },
      },
      {
        id: "writer",
        name: "QA Guest One",
        role: "Co-writer" as const,
        shares: { master: 20, performance: 70, mechanical: 75 },
        signature: { typedName: "QA Guest One", signedAt: NOW.toISOString() },
      },
    ];
    const track = {
      ...buildSeedTracks(NOW)[0],
      ownership: {
        version: 1 as const,
        approvalMethod: "local-acknowledgement" as const,
        parties,
      },
    };
    expect(sharesFor(track)).toEqual([
      { name: "QA Artist Alpha", share: 0.3 },
      { name: "QA Guest One", share: 0.7 },
    ]);
    const sheet = buildSplitSheet(track, NOW);
    expect(sheet.parties.map((party) => party.sharePct)).toEqual([80, 20]);
    expect(sheet.parties[1].role).toBe("Songwriter");
    expect(sheet.parties[1].channel).toBe("Local approval");
  });
});
