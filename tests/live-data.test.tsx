// @vitest-environment jsdom
import { act, cleanup, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ current: null as null | FakeClient }));
vi.mock("@/lib/db/core", async () => {
  const actual = await vi.importActual<typeof import("@/lib/db/core")>("@/lib/db/core");
  return { ...actual, db: () => db.current };
});

import { DEFAULT_INTERVAL_MS, Freshness, useLiveLoad } from "@/lib/db/live";

type Handler = () => void;
type FakeClient = {
  channel: (name: string) => {
    on: (event: string, filter: unknown, cb: Handler) => unknown;
    subscribe: (cb: (status: string) => void) => unknown;
  };
  removeChannel: (c: unknown) => Promise<unknown>;
};

let emit: Handler = () => {};
let subscribed: (status: string) => void = () => {};
let removeChannel = vi.fn(async () => undefined);

const fakeClient = (): FakeClient => ({
  channel: () => {
    const ch = {
      on: (_e: string, _f: unknown, cb: Handler) => {
        emit = cb;
        return ch;
      },
      subscribe: (cb: (status: string) => void) => {
        subscribed = cb;
        return ch;
      },
    };
    return ch;
  },
  removeChannel,
});

/** A playout screen is only "live" if new airplay reaches it without a reload. */
describe("useLiveLoad", () => {
  let loader: () => Promise<{ spins: number }>;
  let spy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    db.current = null;
    removeChannel = vi.fn(async () => undefined);
    spy = vi.fn(async () => ({ spins: 1 }));
    loader = spy as unknown as () => Promise<{ spins: number }>;
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("reads once on mount and reports the read time", async () => {
    const { result } = renderHook(() => useLiveLoad(loader, []));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(result.current.data).toEqual({ spins: 1 });
    expect(result.current.lastUpdated).toBeTypeOf("number");
    expect(result.current.loading).toBe(false);
  });

  it("polls in the background without re-showing the skeleton", async () => {
    const { result } = renderHook(() => useLiveLoad(loader, [], { intervalMs: 1000 }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.loading).toBe(false);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(spy).toHaveBeenCalledTimes(4); // mount + 3 ticks
    expect(result.current.loading).toBe(false); // never flashed back to loading
    expect(result.current.refreshes).toBe(3);
  });

  it("stops polling while the tab is hidden and catches up on return", async () => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    const { result } = renderHook(() => useLiveLoad(loader, [], { intervalMs: 1000 }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(spy).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(spy).toHaveBeenCalledTimes(1); // nothing polled while hidden

    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(spy).toHaveBeenCalledTimes(2);
    expect(result.current.refreshes).toBe(1);
  });

  it("keeps the last good data when a background refresh fails", async () => {
    const { result } = renderHook(() => useLiveLoad(loader, [], { intervalMs: 1000 }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    spy.mockRejectedValueOnce(new Error("network down"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(result.current.error).toBe("network down");
    expect(result.current.data).toEqual({ spins: 1 }); // table not blanked
  });

  it("refreshes instantly on a realtime change, debouncing bursts", async () => {
    db.current = fakeClient();
    const { result } = renderHook(() =>
      useLiveLoad(loader, [], { intervalMs: 60_000, tables: ["detections"] }),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(spy).toHaveBeenCalledTimes(1);

    act(() => subscribed("SUBSCRIBED"));
    expect(result.current.live).toBe(true);

    // three detections in one burst → one read
    await act(async () => {
      emit();
      emit();
      emit();
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("tears the channel down on unmount", async () => {
    db.current = fakeClient();
    const { unmount } = renderHook(() =>
      useLiveLoad(loader, [], { intervalMs: 60_000, tables: ["detections"] }),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    unmount();
    expect(removeChannel).toHaveBeenCalledTimes(1);
  });

  it("reloads on demand", async () => {
    const { result } = renderHook(() => useLiveLoad(loader, []));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      result.current.reload();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(spy).toHaveBeenCalledTimes(2);
  });
});

describe("Freshness", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("says Live when realtime is subscribed", () => {
    vi.useFakeTimers();
    render(<Freshness live lastUpdated={Date.now()} />);
    expect(screen.getByText("Live")).toBeTruthy();
    expect(screen.getByText("updated just now")).toBeTruthy();
  });

  it("falls back to Auto-refresh when realtime is unavailable", () => {
    vi.useFakeTimers();
    render(<Freshness live={false} lastUpdated={Date.now()} />);
    expect(screen.getByText("Auto-refresh")).toBeTruthy();
  });

  it("counts up as time passes", async () => {
    vi.useFakeTimers();
    render(<Freshness live lastUpdated={Date.now()} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(12_000);
    });
    expect(screen.getByText("updated 12s ago")).toBeTruthy();
  });

  it("explains itself while the first read is in flight", () => {
    vi.useFakeTimers();
    render(<Freshness live={false} lastUpdated={null} />);
    expect(screen.getByText("loading…")).toBeTruthy();
  });

  it("shows the polling cadence in its tooltip", () => {
    vi.useFakeTimers();
    render(<Freshness live={false} lastUpdated={Date.now()} intervalMs={DEFAULT_INTERVAL_MS} />);
    expect(screen.getByTitle(/Polling/)).toBeTruthy();
    cleanup();
    render(<Freshness live lastUpdated={Date.now()} />);
    expect(screen.getByTitle(/Realtime/)).toBeTruthy();
  });

  it("is readable without relying on colour alone", () => {
    vi.useFakeTimers();
    const { container } = render(<Freshness live lastUpdated={Date.now()} />);
    expect(container.textContent).toContain("Live");
    expect(container.textContent).toContain("updated");
  });
});
