// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { audioContextAvailable, MonitorFeed } from "@/lib/monitor-audio";

/**
 * The monitor feed is the only part of BMAT that talks to the Web Audio API, and
 * jsdom ships no AudioContext — so without this mock the synthesis graph is never
 * executed by the suite at all.
 */

interface FakeGain {
  gain: {
    value: number;
    cancelScheduledValues: ReturnType<typeof vi.fn>;
    linearRampToValueAtTime: ReturnType<typeof vi.fn>;
  };
  connect: ReturnType<typeof vi.fn>;
}

interface FakeContext {
  state: string;
  currentTime: number;
  sampleRate: number;
  destination: object;
  resume: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  createAnalyser: ReturnType<typeof vi.fn>;
  createGain: ReturnType<typeof vi.fn>;
  createBuffer: ReturnType<typeof vi.fn>;
  createBufferSource: ReturnType<typeof vi.fn>;
  createBiquadFilter: ReturnType<typeof vi.fn>;
  createOscillator: ReturnType<typeof vi.fn>;
  buffers: Float32Array[];
  gains: FakeGain[];
  sources: { stop: ReturnType<typeof vi.fn>; started: boolean }[];
  connections: number;
}

function makeFakeContext(): FakeContext {
  const ctx: FakeContext = {
    state: "suspended",
    currentTime: 0,
    sampleRate: 44_100,
    destination: {},
    resume: vi.fn(async function (this: FakeContext) {
      this.state = "running";
    }),
    close: vi.fn(async function (this: FakeContext) {
      this.state = "closed";
    }),
    buffers: [],
    gains: [],
    sources: [],
    connections: 0,

    createAnalyser: vi.fn(() => ({
      fftSize: 0,
      smoothingTimeConstant: 0,
      connect: vi.fn(() => {
        ctx.connections += 1;
      }),
      disconnect: vi.fn(),
    })),

    createGain: vi.fn(() => {
      const node: FakeGain = {
        gain: {
          value: 0,
          cancelScheduledValues: vi.fn(),
          linearRampToValueAtTime: vi.fn(),
        },
        connect: vi.fn(() => {
          ctx.connections += 1;
        }),
      };
      ctx.gains.push(node);
      return node;
    }),

    createBuffer: vi.fn((_channels: number, length: number) => {
      const data = new Float32Array(length);
      ctx.buffers.push(data);
      return { getChannelData: () => data };
    }),

    createBufferSource: vi.fn(() => {
      const node = {
        buffer: null,
        loop: false,
        connect: vi.fn(() => {
          ctx.connections += 1;
        }),
        start: vi.fn(() => {
          node.started = true;
        }),
        stop: vi.fn(),
        started: false,
      };
      ctx.sources.push(node);
      return node;
    }),

    createBiquadFilter: vi.fn(() => ({
      type: "",
      frequency: { value: 0 },
      Q: { value: 0 },
      connect: vi.fn(() => {
        ctx.connections += 1;
      }),
    })),

    createOscillator: vi.fn(() => {
      const node = {
        type: "",
        frequency: { value: 0 },
        connect: vi.fn(() => {
          ctx.connections += 1;
        }),
        start: vi.fn(() => {
          node.started = true;
        }),
        stop: vi.fn(),
        started: false,
      };
      ctx.sources.push(node);
      return node;
    }),
  };

  return ctx;
}

let fake: FakeContext;

beforeEach(() => {
  fake = makeFakeContext();
  vi.stubGlobal("AudioContext", function () {
    return fake;
  } as unknown as typeof AudioContext);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

describe("audioContextAvailable", () => {
  it("is true once an AudioContext exists", () => {
    expect(audioContextAvailable()).toBe(true);
  });

  it("is false in an environment without Web Audio", () => {
    vi.stubGlobal("AudioContext", undefined);
    expect(audioContextAvailable()).toBe(false);
  });
});

describe("MonitorFeed.start", () => {
  it("resumes a suspended context before building the graph", async () => {
    const feed = new MonitorFeed();
    await feed.start();

    expect(fake.resume).toHaveBeenCalledTimes(1);
    expect(fake.state).toBe("running");
  });

  it("builds one noise bed and the tone partials", async () => {
    const feed = new MonitorFeed();
    await feed.start();

    expect(fake.createAnalyser).toHaveBeenCalledTimes(1);
    expect(fake.createBuffer).toHaveBeenCalledTimes(1);
    expect(fake.createBufferSource).toHaveBeenCalledTimes(1);
    expect(fake.createBiquadFilter).toHaveBeenCalledTimes(1);
    // Three sustained partials, each with its own amplitude LFO.
    expect(fake.createOscillator).toHaveBeenCalledTimes(6);
  });

  it("configures the analyser the visualizer reads from", async () => {
    const feed = new MonitorFeed();
    await feed.start();

    const analyser = feed.getAnalyser();
    expect(analyser).not.toBeNull();
    expect(analyser!.fftSize).toBe(1024);
    expect(analyser!.smoothingTimeConstant).toBeCloseTo(0.72);
  });

  it("actually generates a non-silent noise buffer", async () => {
    const feed = new MonitorFeed({ seed: 1.3 });
    await feed.start();

    const buffer = fake.buffers[0];
    expect(buffer.length).toBe(44_100 * 4);

    const nonZero = buffer.filter((v) => v !== 0).length;
    expect(nonZero).toBeGreaterThan(buffer.length * 0.9);

    // Pink noise sits in a sane amplitude band — not DC, not clipping.
    let peak = 0;
    for (const sample of buffer) peak = Math.max(peak, Math.abs(sample));

    expect(peak).toBeGreaterThan(0.01);
    expect(peak).toBeLessThan(1);
  });

  it("starts every source", async () => {
    const feed = new MonitorFeed();
    await feed.start();

    expect(fake.sources.length).toBe(7); // 1 buffer source + 6 oscillators
    expect(fake.sources.every((s) => s.started)).toBe(true);
  });

  it("fades in to the requested volume", async () => {
    const feed = new MonitorFeed({ volume: 0.2 });
    await feed.start();

    const master = fake.gains[0];
    expect(master.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0.2, expect.any(Number));
  });

  it("is idempotent — a second start does not rebuild the graph", async () => {
    const feed = new MonitorFeed();
    await feed.start();
    const analyserCount = fake.createAnalyser.mock.calls.length;

    expect(await feed.start()).toBe(true);
    expect(fake.createAnalyser.mock.calls.length).toBe(analyserCount);
    expect(feed.playing).toBe(true);
  });

  it("varies the partials with the seed so stations differ", async () => {
    const a = makeFakeContext();
    const b = makeFakeContext();

    vi.stubGlobal("AudioContext", function () {
      return a;
    } as unknown as typeof AudioContext);
    await new MonitorFeed({ seed: 1 }).start();

    vi.stubGlobal("AudioContext", function () {
      return b;
    } as unknown as typeof AudioContext);
    await new MonitorFeed({ seed: 1.5 }).start();

    // mock.results holds live references, so the final tuned values are readable.
    const partials = (ctx: FakeContext) =>
      (ctx.createOscillator as ReturnType<typeof vi.fn>).mock.results.map(
        (r) => (r.value as { frequency: { value: number } }).frequency.value,
      );

    const first = partials(a);
    const second = partials(b);

    expect(first.length).toBe(6);
    expect(second.length).toBe(6);
    expect(second[0]).toBeCloseTo(first[0] * 1.5, 6);
    expect(second).not.toEqual(first);
  });
});

describe("MonitorFeed.setVolume", () => {
  it("ramps to the new level", async () => {
    const feed = new MonitorFeed({ volume: 0.1 });
    await feed.start();

    feed.setVolume(0.45);

    const master = fake.gains[0];
    expect(master.gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(0.45, expect.any(Number));
    expect(feed.getVolume()).toBe(0.45);
  });

  it("clamps out-of-range values", async () => {
    const feed = new MonitorFeed();
    await feed.start();

    feed.setVolume(4);
    expect(feed.getVolume()).toBe(1);

    feed.setVolume(-2);
    expect(feed.getVolume()).toBe(0);
  });

  it("is safe before the feed has started", () => {
    const feed = new MonitorFeed();
    expect(() => feed.setVolume(0.3)).not.toThrow();
    expect(feed.getVolume()).toBe(0.3);
  });
});

describe("MonitorFeed.stop", () => {
  it("fades out, stops the sources and closes the context", async () => {
    const feed = new MonitorFeed();
    await feed.start();
    expect(feed.playing).toBe(true);

    feed.stop();
    expect(feed.playing).toBe(false);

    await sleep(200);

    expect(fake.sources.every((s) => s.stop.mock.calls.length > 0)).toBe(true);
    expect(fake.close).toHaveBeenCalledTimes(1);
    expect(fake.state).toBe("closed");
  });

  it("drops the analyser so the visualizer goes idle", async () => {
    const feed = new MonitorFeed();
    await feed.start();
    expect(feed.getAnalyser()).not.toBeNull();

    feed.stop();
    expect(feed.getAnalyser()).toBeNull();
  });

  it("is safe to call twice", async () => {
    const feed = new MonitorFeed();
    await feed.start();

    expect(() => {
      feed.stop();
      feed.stop();
    }).not.toThrow();

    await sleep(200);
    expect(feed.playing).toBe(false);
  });

  it("is safe to call before starting", () => {
    const feed = new MonitorFeed();
    expect(() => feed.stop()).not.toThrow();
    expect(feed.playing).toBe(false);
  });
});

describe("MonitorFeed without Web Audio", () => {
  it("reports failure instead of throwing", async () => {
    vi.stubGlobal("AudioContext", undefined);

    const feed = new MonitorFeed();
    expect(await feed.start()).toBe(false);
    expect(feed.playing).toBe(false);
    expect(feed.getAnalyser()).toBeNull();
  });
});
