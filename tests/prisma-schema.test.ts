// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { getDMMF } from "@prisma/internals";

// getDMMF runs the Prisma wasm validator in-process, so this checks the schema
// without a database or the Rust engine download. It resolves relations, so a
// dangling or malformed relation fails the suite.
describe("prisma schema", () => {
  it("validates and exposes the six core models", async () => {
    const datamodel = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
    const dmmf = await getDMMF({ datamodel });
    const models = dmmf.datamodel.models.map((m) => m.name);

    for (const name of [
      "User",
      "Track",
      "RadioStation",
      "AirplayMatch",
      "RoyaltyReport",
      "RoyaltyStatement",
      "PayoutBatch",
      "AdCampaign",
    ]) {
      expect(models, `missing model ${name}`).toContain(name);
    }
  });

  it("joins the catalogue to the panel through AirplayMatch", async () => {
    const datamodel = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
    const dmmf = await getDMMF({ datamodel });
    const match = dmmf.datamodel.models.find((m) => m.name === "AirplayMatch")!;
    const rels = match.fields.filter((f) => f.relationName).map((f) => f.type);

    expect(rels).toContain("Track");
    expect(rels).toContain("RadioStation");
  });

  it("keeps ISRC unique on Track and SplitSheet", async () => {
    const datamodel = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
    const dmmf = await getDMMF({ datamodel });

    for (const modelName of ["Track", "SplitSheet"]) {
      const model = dmmf.datamodel.models.find((m) => m.name === modelName)!;
      const isrc = model.fields.find((f) => f.name === "isrc")!;
      expect(isrc.isUnique, `${modelName}.isrc must be unique`).toBe(true);
    }
  });

  it("links royalty statements to reports and payout batches", async () => {
    const datamodel = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
    const dmmf = await getDMMF({ datamodel });

    const statement = dmmf.datamodel.models.find((m) => m.name === "RoyaltyStatement")!;
    const batch = dmmf.datamodel.models.find((m) => m.name === "PayoutBatch")!;

    const statementRels = statement.fields.filter((f) => f.relationName).map((f) => f.type);
    expect(statementRels).toContain("RoyaltyReport");
    expect(statementRels).toContain("PayoutBatch");

    const batchRels = batch.fields.filter((f) => f.relationName).map((f) => f.type);
    expect(batchRels).toContain("RoyaltyStatement");
    expect(batchRels).toContain("User");
  });
});
