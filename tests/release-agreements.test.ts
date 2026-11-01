import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { testActor } from "@/tests/fixtures/auth";
import { toneMaster } from "@/tests/fixtures/master";
vi.mock("server-only", () => ({}));
let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "east-sound-agreements-"));
  vi.stubEnv("EAST_SOUND_DATA_DIR", directory);
  vi.resetModules();
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});
async function setup() {
  const owner = await testActor("artist", "owner@example.com"),
    writer = await testActor("artist", "writer@example.com"),
    producer = await testActor("artist", "producer@example.com"),
    route = await import("@/app/api/agreements/route"),
    master = toneMaster();
  const parties = [
    {
      id: "primary",
      name: "Primary Artist",
      role: "Primary artist",
      email: owner.user.email,
      shares: { master: 50, performance: 50, mechanical: 50 },
    },
    {
      id: "writer",
      name: "Co Writer",
      role: "Co-writer",
      email: writer.user.email,
      shares: { master: 25, performance: 25, mechanical: 25 },
    },
    {
      id: "producer",
      name: "Producer",
      role: "Producer",
      email: producer.user.email,
      shares: { master: 25, performance: 25, mechanical: 25 },
    },
  ];
  const metadata = {
    title: "Signed release",
    primaryArtist: "Primary Artist",
    featuredArtists: [],
    releaseDate: "2026-11-01",
    isrc: "UG-ESD-26-03001",
  };
  const created = await route.POST(
    owner.request("/api/agreements", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "create",
        metadata,
        parties,
        sourceSha256: master.signature.sourceSha256,
        fingerprintDigest: master.signature.digest,
      }),
    }),
  );
  expect(created.status).toBe(201);
  return { owner, writer, producer, route, parties, ...(await created.json()) };
}
const body = (value: unknown) => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(value),
});
describe("independent account-bound collaborator sign-off", () => {
  it("stores only hashed private invitations and rejects an owner impersonating a co-writer", async () => {
    const { owner, writer, route, agreement, invitations } = await setup();
    const raw = await readFile(
      path.join(directory, "security/accounts.json"),
      "utf8",
    );
    for (const invitation of invitations)
      expect(raw).not.toContain(invitation.token);
    const forged = await route.POST(
      owner.request(
        "/api/agreements",
        body({
          action: "approve",
          id: agreement.id,
          partyId: "writer",
          typedName: "Co Writer",
          acknowledgement: true,
          userId: writer.user.id,
        }),
      ),
    );
    expect(forged.status).toBe(403);
    expect(
      (
        await route.GET(
          owner.request("/api/agreements?invite=" + invitations[0].token),
        )
      ).status,
    ).toBe(404);
  });
  it("preserves concurrent independent approvals and binds each one to the immutable credits/splits/audio digest", async () => {
    const { owner, writer, producer, route, agreement, invitations } =
      await setup();
    const result = await Promise.all([
      route.POST(
        owner.request(
          "/api/agreements",
          body({
            action: "approve",
            id: agreement.id,
            partyId: "primary",
            typedName: "Primary Artist",
            acknowledgement: true,
          }),
        ),
      ),
      route.POST(
        writer.request(
          "/api/agreements",
          body({
            action: "approve",
            invite: invitations.find(
              (i: { partyId: string }) => i.partyId === "writer",
            ).token,
            typedName: "Co Writer",
            acknowledgement: true,
          }),
        ),
      ),
      route.POST(
        producer.request(
          "/api/agreements",
          body({
            action: "approve",
            invite: invitations.find(
              (i: { partyId: string }) => i.partyId === "producer",
            ).token,
            typedName: "Producer",
            acknowledgement: true,
          }),
        ),
      ),
    ]);
    expect(result.every((r) => r.status === 200)).toBe(true);
    const current = await (
      await route.GET(owner.request("/api/agreements?id=" + agreement.id))
    ).json();
    expect(current.agreement.approvals).toHaveLength(3);
    expect(
      new Set(
        current.agreement.approvals.map((a: { userId: string }) => a.userId),
      ).size,
    ).toBe(3);
    expect(
      current.agreement.approvals.every(
        (a: { bindingDigest: string }) =>
          a.bindingDigest === agreement.bindingDigest,
      ),
    ).toBe(true);
  });
  it("limits invitation previews to their signed-in recipient and redacts other email addresses", async () => {
    const { owner, writer, route, invitations, agreement } = await setup();
    const outsider = await testActor();
    expect(
      (
        await route.GET(
          outsider.request("/api/agreements?invite=" + invitations[0].token),
        )
      ).status,
    ).toBe(404);
    expect(
      (await route.GET(writer.request("/api/agreements?id=" + agreement.id)))
        .status,
    ).toBe(404);
    const preview = await route.GET(
      writer.request("/api/agreements?invite=" + invitations[0].token),
    );
    expect(preview.status).toBe(200);
    expect(await preview.text()).not.toContain(owner.user.email);
  });
  it("cancels pending versions without allowing material edits or a cancelled link to approve", async () => {
    const { owner, writer, route, agreement, invitations } = await setup();
    const cancelled = await route.POST(
      owner.request(
        "/api/agreements",
        body({ action: "cancel", id: agreement.id }),
      ),
    );
    expect(cancelled.status).toBe(200);
    expect(
      (
        await route.POST(
          writer.request(
            "/api/agreements",
            body({
              action: "approve",
              invite: invitations[0].token,
              typedName: "Co Writer",
              acknowledgement: true,
            }),
          ),
        )
      ).status,
    ).toBe(409);
  });
});
