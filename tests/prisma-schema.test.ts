// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { getDMMF } from "@prisma/internals";

// getDMMF runs the Prisma wasm validator in-process, so this checks the schema
// without a database or the Rust engine download. It resolves relations, so a
// dangling or malformed relation fails the suite.
describe("prisma schema", () => {
  it("validates and exposes the master entity models", async () => {
    const datamodel = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
    const dmmf = await getDMMF({ datamodel });
    const models = dmmf.datamodel.models.map((m) => m.name);

    for (const name of [
      "Profile",
      "Label",
      "Artist",
      "Track",
      "TrackSplit",
      "BroadcastStation",
      "Venue",
      "StationPlayoutLog",
      "VenuePlayoutLog",
      "Dispute",
    ]) {
      expect(models, `missing model ${name}`).toContain(name);
    }
  });

  it("links the catalogue to artists and labels", async () => {
    const datamodel = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
    const dmmf = await getDMMF({ datamodel });
    const track = dmmf.datamodel.models.find((m) => m.name === "Track")!;
    const rels = track.fields.filter((f) => f.relationName).map((f) => f.type);

    expect(rels).toContain("Artist");
    expect(rels).toContain("Label");
  });

  it("keeps ISRC unique on Track", async () => {
    const datamodel = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
    const dmmf = await getDMMF({ datamodel });

    const model = dmmf.datamodel.models.find((m) => m.name === "Track")!;
    const isrc = model.fields.find((f) => f.name === "isrc")!;
    expect(isrc.isUnique, `${model.name}.isrc must be unique`).toBe(true);
  });

  it("links playout logs to stations, venues and tracks", async () => {
    const datamodel = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
    const dmmf = await getDMMF({ datamodel });

    const stationLog = dmmf.datamodel.models.find((m) => m.name === "StationPlayoutLog")!;
    const venueLog = dmmf.datamodel.models.find((m) => m.name === "VenuePlayoutLog")!;

    const stationRels = stationLog.fields.filter((f) => f.relationName).map((f) => f.type);
    expect(stationRels).toContain("BroadcastStation");
    expect(stationRels).toContain("Track");

    const venueRels = venueLog.fields.filter((f) => f.relationName).map((f) => f.type);
    expect(venueRels).toContain("Venue");
    expect(venueRels).toContain("Track");
  });

  it("links disputes to tracks and the filing profile", async () => {
    const datamodel = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
    const dmmf = await getDMMF({ datamodel });

    const dispute = dmmf.datamodel.models.find((m) => m.name === "Dispute")!;
    const rels = dispute.fields.filter((f) => f.relationName).map((f) => f.type);

    expect(rels).toContain("Track");
    expect(rels).toContain("Profile");
  });

  it("defines the five master roles and venue categories", async () => {
    const datamodel = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
    const dmmf = await getDMMF({ datamodel });

    const userRole = dmmf.datamodel.enums.find((e) => e.name === "UserRole")!;
    expect(userRole.values.map((v) => v.name)).toEqual([
      "CMO",
      "LABEL",
      "ARTIST",
      "BROADCASTER",
      "VENUE",
    ]);

    const venueCategory = dmmf.datamodel.enums.find((e) => e.name === "VenueCategory")!;
    expect(venueCategory.values.length).toBe(5);
  });
});
