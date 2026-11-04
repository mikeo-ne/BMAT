import { createHash } from "node:crypto";
import { pcmFeatures, signaturePayload } from "@/lib/master-signature";
import type { AudioSignature } from "@/lib/types";
import type { testActor } from "@/tests/fixtures/auth";
export function toneMaster(seconds = 1, hz = 440) {
  const rate = 11025,
    samples = new Float32Array(Math.round(rate * seconds)),
    bytes = Buffer.alloc(44 + samples.length * 2);
  bytes.write("RIFF");
  bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write("WAVE", 8);
  bytes.write("fmt ", 12);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(rate, 24);
  bytes.writeUInt32LE(rate * 2, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36);
  bytes.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) {
    const n = Math.round(Math.sin((i / rate) * 2 * Math.PI * hz) * 12000);
    bytes.writeInt16LE(n, 44 + i * 2);
    samples[i] = n / 32768;
  }
  const features = pcmFeatures(samples);
  const signature: AudioSignature = {
    version: 1,
    algorithm: "pcm-rms-fft-v1",
    sampleRate: 11025,
    durationSec: seconds,
    analysedSec: seconds,
    sourceSha256: createHash("sha256").update(bytes).digest("hex"),
    digest: createHash("sha256")
      .update(signaturePayload(features))
      .digest("hex"),
    ...features,
  };
  return { bytes, signature };
}
export async function deliveryFixture(
  actor: Awaited<ReturnType<typeof testActor>>,
  isrc = "UG-ESD-26-00100",
  approve = true,
) {
  const agreements = await import("@/app/api/agreements/route"),
    master = toneMaster();
  const metadata = {
    title: "Test master",
    primaryArtist: "QA Artist Alpha",
    featuredArtists: [],
    releaseDate: "2026-11-01",
    isrc,
  };
  const response = await agreements.POST(
    actor.request("/api/agreements", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "create",
        metadata,
        sourceSha256: master.signature.sourceSha256,
        fingerprintDigest: master.signature.digest,
        parties: [
          {
            id: "primary",
            name: metadata.primaryArtist,
            role: "Primary artist",
            shares: { master: 100, performance: 100, mechanical: 100 },
          },
        ],
      }),
    }),
  );
  if (response.status !== 201)
    throw new Error(
      "Test agreement could not be created: " + (await response.text()),
    );
  const { agreement } = await response.json();
  if (approve) {
    const approval = await agreements.POST(
      actor.request("/api/agreements", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "approve",
          id: agreement.id,
          partyId: "primary",
          typedName: metadata.primaryArtist,
          acknowledgement: true,
        }),
      }),
    );
    if (!approval.ok) throw new Error("Test agreement approval failed.");
  }
  function form() {
    const result = new FormData();
    result.set(
      "audio",
      new File(
        [new Uint8Array(master.bytes)],
        "QA Artist Alpha - Test master.wav",
        { type: "audio/wav" },
      ),
    );
    for (const [key, value] of Object.entries(metadata))
      result.set(key, Array.isArray(value) ? value.join(", ") : value);
    result.set("fingerprint", JSON.stringify(master.signature));
    result.set("agreementId", agreement.id);
    return result;
  }
  return { ...master, metadata, agreement, form };
}
