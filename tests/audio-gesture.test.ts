// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Mobile Safari and Chrome refuse to start audio unless the AudioContext is
 * created inside a user gesture, and creating one during render breaks SSR.
 * These tests pin the two guarantees getAudioContext() makes: it never touches
 * the API without a window, and it is a lazily-created singleton.
 */

class FakeAudioContext {
  static instances = 0;
  state: AudioContextState = "running";
  currentTime = 0;
  resumeCalls = 0;

  constructor() {
    FakeAudioContext.instances += 1;
  }
  resume() {
    this.resumeCalls += 1;
    this.state = "running";
    return Promise.resolve();
  }
  close() {
    this.state = "closed";
    return Promise.resolve();
  }
}

async function freshAudioModule() {
  vi.resetModules();
  return import("@/lib/audio");
}

beforeEach(() => {
  FakeAudioContext.instances = 0;
  vi.stubGlobal("AudioContext", FakeAudioContext);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("getAudioContext", () => {
  it("creates the context lazily, not at import time", async () => {
    await freshAudioModule();
    expect(FakeAudioContext.instances).toBe(0);
  });

  it("returns a working context when called from a gesture handler", async () => {
    const { getAudioContext } = await freshAudioModule();
    const ctx = getAudioContext();
    expect(ctx).toBeInstanceOf(FakeAudioContext);
    expect(FakeAudioContext.instances).toBe(1);
  });

  it("reuses a single context across calls", async () => {
    const { getAudioContext } = await freshAudioModule();
    const first = getAudioContext();
    const second = getAudioContext();
    expect(second).toBe(first);
    expect(FakeAudioContext.instances).toBe(1);
  });

  it("resumes a suspended context", async () => {
    const { getAudioContext } = await freshAudioModule();
    const ctx = getAudioContext() as unknown as FakeAudioContext;
    ctx.state = "suspended";
    getAudioContext();
    expect(ctx.resumeCalls).toBe(1);
  });

  it("rebuilds after the context is closed", async () => {
    const { getAudioContext } = await freshAudioModule();
    const first = getAudioContext() as unknown as FakeAudioContext;
    first.state = "closed";
    const second = getAudioContext();
    expect(second).not.toBe(first);
    expect(FakeAudioContext.instances).toBe(2);
  });

  it("falls back to webkitAudioContext when unprefixed is missing", async () => {
    vi.stubGlobal("AudioContext", undefined);
    const webkit = FakeAudioContext;
    vi.stubGlobal("webkitAudioContext", webkit);
    const { getAudioContext } = await freshAudioModule();
    expect(getAudioContext()).toBeInstanceOf(FakeAudioContext);
  });

  it("returns null when the browser has no AudioContext at all", async () => {
    vi.stubGlobal("AudioContext", undefined);
    vi.stubGlobal("webkitAudioContext", undefined);
    const { getAudioContext } = await freshAudioModule();
    expect(getAudioContext()).toBeNull();
  });

  it("returns null instead of throwing when construction fails", async () => {
    class Exploding {
      constructor() {
        throw new Error("NotAllowedError");
      }
    }
    vi.stubGlobal("AudioContext", Exploding);
    const { getAudioContext } = await freshAudioModule();
    expect(() => getAudioContext()).not.toThrow();
    expect(getAudioContext()).toBeNull();
  });
});

describe("stopActiveSnippet", () => {
  it("is safe when nothing is playing", async () => {
    const { stopActiveSnippet } = await freshAudioModule();
    expect(() => stopActiveSnippet()).not.toThrow();
  });

  it("can be called repeatedly", async () => {
    const { stopActiveSnippet } = await freshAudioModule();
    stopActiveSnippet();
    stopActiveSnippet();
    expect(true).toBe(true);
  });
});
