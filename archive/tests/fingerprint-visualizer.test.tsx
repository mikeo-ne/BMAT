// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AudioFingerprintVisualizer } from "@/components/audio-fingerprint-visualizer";

/**
 * jsdom ships no AudioContext and no 2D canvas, so both are stubbed. That means
 * these tests exercise the control flow and the draw *calls* — they cannot
 * verify pixels.
 */

const BINS = 128; // fftSize 256 / 2
const PEAK_BIN = 20;
const CANVAS_W = 600;
const CANVAS_H = 192;

let ctxCalls: { fillRect: number[][]; arc: number[][]; gradients: number };
let rafCallback: FrameRequestCallback | null;
let cancelled: number[];

function makeCtx() {
  ctxCalls = { fillRect: [], arc: [], gradients: 0 };
  return {
    setTransform: vi.fn(),
    fillRect: (...args: number[]) => ctxCalls.fillRect.push(args),
    createLinearGradient: () => {
      ctxCalls.gradients += 1;
      return { addColorStop: vi.fn() };
    },
    beginPath: vi.fn(),
    arc: (...args: number[]) => ctxCalls.arc.push(args),
    fill: vi.fn(),
    set fillStyle(_v: unknown) {},
    set shadowColor(_v: unknown) {},
    set shadowBlur(_v: unknown) {},
  };
}

class FakeAnalyser {
  fftSize = 2048;
  smoothingTimeConstant = 0.8;
  get frequencyBinCount() {
    return this.fftSize / 2;
  }
  getByteFrequencyData(target: Uint8Array) {
    target.fill(0);
    if (PEAK_BIN < target.length) target[PEAK_BIN] = 220;
  }
}

class FakeAudioContext {
  state = "running";
  closed = false;
  createAnalyser = vi.fn(() => new FakeAnalyser());
  createMediaStreamSource = vi.fn(() => ({ connect: vi.fn() }));
  close = vi.fn(async () => {
    this.closed = true;
    this.state = "closed";
  });
  resume = vi.fn(async () => {
    this.state = "running";
  });
}

let lastContext: FakeAudioContext | null;
let stopTrack: ReturnType<typeof vi.fn>;

function grantMicrophone(error?: Error) {
  lastContext = null;
  stopTrack = vi.fn();

  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: vi.fn(async () => {
        if (error) throw error;
        lastContext = new FakeAudioContext();
        return { getTracks: () => [{ stop: stopTrack }] };
      }),
    },
  });
}

beforeEach(() => {
  // Baseline: no capture API at all. grantMicrophone() adds one per test, and
  // defineProperty (rather than assignment) keeps it removable afterwards.
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: undefined,
  });

  vi.stubGlobal("AudioContext", function () {
    // The component constructs one instance per start.
    lastContext = new FakeAudioContext();
    return lastContext;
  });

  Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
    configurable: true,
    value: () => makeCtx(),
  });

  Object.defineProperty(HTMLCanvasElement.prototype, "clientWidth", {
    configurable: true,
    value: CANVAS_W,
  });
  Object.defineProperty(HTMLCanvasElement.prototype, "clientHeight", {
    configurable: true,
    value: CANVAS_H,
  });

  rafCallback = null;
  cancelled = [];
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    rafCallback = cb;
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => cancelled.push(id));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** Start monitoring and let one frame render. */
async function startAndDrawOneFrame() {
  grantMicrophone();
  render(<AudioFingerprintVisualizer fftSize={256} peakThreshold={140} />);

  fireEvent.click(screen.getByRole("button", { name: /Start monitoring/ }));

  await waitFor(() =>
    expect(screen.getByRole("button", { name: /Stop listening/ })).toBeTruthy(),
  );

  // drawLoop() paints one frame synchronously and schedules the next. Reset the
  // log, then run that scheduled frame, so exactly one frame is under test.
  const frame = rafCallback;
  expect(frame).toBeTruthy();
  ctxCalls = { fillRect: [], arc: [], gradients: 0 };
  frame!(0);

  return ctxCalls;
}

describe("AudioFingerprintVisualizer idle state", () => {
  it("shows the idle overlay and an inactive toggle", () => {
    grantMicrophone();
    render(<AudioFingerprintVisualizer />);

    const button = screen.getByRole("button", { name: /Start monitoring/ });
    expect(button.getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByText(/Select .Start monitoring./)).toBeTruthy();
    expect(screen.getByRole("img").getAttribute("aria-label")).toBe("Idle frequency spectrum");
  });

  it("never touches the microphone until asked", () => {
    grantMicrophone();
    render(<AudioFingerprintVisualizer />);

    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
  });
});

describe("AudioFingerprintVisualizer capture", () => {
  it("requests an audio-only stream and flips to listening", async () => {
    grantMicrophone();
    render(<AudioFingerprintVisualizer />);

    fireEvent.click(screen.getByRole("button", { name: /Start monitoring/ }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Stop listening/ })).toBeTruthy(),
    );

    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
      audio: true,
      video: false,
    });
    expect(screen.getByRole("button", { name: /Stop listening/ }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(screen.getByRole("img").getAttribute("aria-label")).toContain("spectrum");
  });

  it("surfaces a blocked microphone instead of failing silently", async () => {
    grantMicrophone(Object.assign(new Error("nope"), { name: "NotAllowedError" }));
    render(<AudioFingerprintVisualizer />);

    fireEvent.click(screen.getByRole("button", { name: /Start monitoring/ }));

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("Microphone access was blocked"),
    );
    expect(screen.getByRole("button", { name: /Start monitoring/ })).toBeTruthy();
  });

  it("reports a missing input device distinctly", async () => {
    grantMicrophone(Object.assign(new Error("nope"), { name: "NotFoundError" }));
    render(<AudioFingerprintVisualizer />);

    fireEvent.click(screen.getByRole("button", { name: /Start monitoring/ }));

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("No audio input device"),
    );
  });

  it("reports an unsupported browser when getUserMedia is absent", async () => {
    // jsdom exposes no mediaDevices, so this is the default state.
    render(<AudioFingerprintVisualizer />);

    fireEvent.click(screen.getByRole("button", { name: /Start monitoring/ }));

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("exposes no getUserMedia"),
    );
  });

  it("tears down the stream and the context on stop", async () => {
    grantMicrophone();
    render(<AudioFingerprintVisualizer />);

    fireEvent.click(screen.getByRole("button", { name: /Start monitoring/ }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Stop listening/ })).toBeTruthy(),
    );

    const context = lastContext!;
    fireEvent.click(screen.getByRole("button", { name: /Stop listening/ }));

    await waitFor(() => expect(screen.getByRole("button", { name: /Start monitoring/ })).toBeTruthy());

    expect(stopTrack).toHaveBeenCalled();
    expect(context.close).toHaveBeenCalled();
    expect(cancelled.length).toBeGreaterThan(0);
  });
});

describe("AudioFingerprintVisualizer draw loop", () => {
  it("paints every bin inside the canvas, not past its right edge", async () => {
    const calls = await startAndDrawOneFrame();

    // One fillRect clears the background; the rest are spectrum bars.
    const bars = calls.fillRect.slice(1);
    expect(bars.length).toBe(BINS);

    const rightmost = bars.reduce((max, [x]) => (x > max ? x : max), 0);
    expect(rightmost).toBeLessThan(CANVAS_W);
  });

  it("builds the gradient once per frame rather than once per bar", async () => {
    const calls = await startAndDrawOneFrame();

    expect(calls.gradients).toBe(1);
  });

  it("draws a landmark marker for the detected peak", async () => {
    const calls = await startAndDrawOneFrame();

    expect(calls.arc.length).toBe(1);
    const [x] = calls.arc[0];
    expect(x).toBeGreaterThan(0);
    expect(x).toBeLessThan(CANVAS_W);
  });

  it("publishes the landmark count to the read-out", async () => {
    await startAndDrawOneFrame();

    expect(screen.getByText("1 landmark")).toBeTruthy();
  });
});
