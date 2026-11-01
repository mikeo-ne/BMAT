import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { testActor } from "@/tests/fixtures/auth";
import { deliveryFixture } from "@/tests/fixtures/master";
vi.mock("server-only", () => ({}));
let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "east-sound-reviews-"));
  vi.stubEnv("EAST_SOUND_DATA_DIR", directory);
  vi.resetModules();
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});
const body = (value: unknown) => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(value),
});
async function setup() {
  const owner = await testActor(),
    cmo = await testActor("cmo"),
    other = await testActor("cmo"),
    draft = await deliveryFixture(owner);
  const delivered = await (
    await import("@/app/api/tracks/route")
  ).POST(owner.request("/api/tracks", { method: "POST", body: draft.form() }));
  expect(delivered.status).toBe(201);
  const { track } = await delivered.json(),
    route = await import("@/app/api/rights-reviews/route");
  const review = {
    requestId: randomUUID(),
    trackId: track.id,
    decision: "reviewed",
    note: "All three signed rights pools have been checked against this agreement.",
  };
  return { owner, cmo, other, track, route, review };
}
describe("authoritative CMO split review ledger", () => {
  it("blocks guests, artists and forged roles from reading or writing auditor decisions", async () => {
    const { owner, route, review } = await setup();
    expect(
      (
        await route.GET(
          new Request("https://app.example.com/api/rights-reviews"),
        )
      ).status,
    ).toBe(401);
    expect(
      (await route.GET(owner.request("/api/rights-reviews?role=cmo"))).status,
    ).toBe(403);
    expect(
      (await route.POST(owner.request("/api/rights-reviews", body(review))))
        .status,
    ).toBe(403);
  });
  it("persists an immutable account-bound decision, ignores claimed actor/timestamps, and records audit exactly once on retry", async () => {
    const { cmo, other, track, route, review } = await setup();
    const post = () =>
      route.POST(
        cmo.request(
          "/api/rights-reviews",
          body({
            ...review,
            auditorId: other.user.id,
            decidedAt: "2000-01-01T00:00:00.000Z",
          }),
        ),
      );
    const first = await post();
    expect(first.status).toBe(201);
    const record = (await first.json()).review;
    expect(record.auditorId).toBe(cmo.user.id);
    expect(record.bindingDigest).toBe(track.ownership.bindingDigest);
    expect(Date.parse(record.decidedAt)).toBeGreaterThan(Date.now() - 5000);
    expect((await (await post()).json()).review).toEqual(record);
    const all = await (
      await route.GET(other.request("/api/rights-reviews"))
    ).json();
    expect(all.reviews).toEqual([record]);
    const changed = await route.POST(
      cmo.request(
        "/api/rights-reviews",
        body({ ...review, decision: "contested" }),
      ),
    );
    expect(changed.status).toBe(409);
    const { readSecurityAudit } = await import("@/lib/security-store");
    expect(
      (await readSecurityAudit()).filter(
        (r: unknown) =>
          (r as { action: string }).action === "rights.review_recorded",
      ),
    ).toHaveLength(1);
    const stored = (await (await import("@/lib/store")).readTracks()).find(
      (t) => t.id === track.id,
    );
    expect(stored?.ownership).toEqual(track.ownership);
  });
  it("never certifies unknown rights but permits a documented request for fresh contributor approvals", async () => {
    const { cmo, route } = await setup(),
      store = await import("@/lib/store"),
      reference = (await store.readTracks()).find(
        (t) => t.origin === "public-reference",
      )!;
    const input = {
      requestId: randomUUID(),
      trackId: reference.id,
      decision: "reviewed",
      note: "Public metadata is not an ownership declaration.",
    };
    expect(
      (await route.POST(cmo.request("/api/rights-reviews", body(input))))
        .status,
    ).toBe(422);
    const request = await route.POST(
      cmo.request(
        "/api/rights-reviews",
        body({ ...input, decision: "needs-correction" }),
      ),
    );
    expect(request.status).toBe(201);
    expect((await request.json()).review.agreementId).toBeNull();
    expect(
      (
        await route.POST(
          cmo.request(
            "/api/rights-reviews",
            body({ ...input, requestId: randomUUID(), note: "short" }),
          ),
        )
      ).status,
    ).toBe(422);
  });
});
