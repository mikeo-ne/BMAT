import { afterEach, describe, expect, it, vi } from "vitest";

/** Node environment: no window at all, which is what SSR renders under. */
afterEach(() => vi.resetModules());

describe("audio helpers during SSR", () => {
  it("getAudioContext returns null instead of touching the browser API", async () => {
    vi.resetModules();
    const { getAudioContext } = await import("@/lib/audio");
    expect(typeof window).toBe("undefined");
    expect(getAudioContext()).toBeNull();
  });

  it("stopActiveSnippet is a no-op", async () => {
    vi.resetModules();
    const { stopActiveSnippet } = await import("@/lib/audio");
    expect(() => stopActiveSnippet()).not.toThrow();
  });
});
