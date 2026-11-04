// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCapturedFeed } from "@/lib/use-captured-feed";
import { CAPTURE_NOW, capturedSpin } from "@/tests/fixtures/captured";
const fetcher = vi.fn();
function Harness({ canPoll = true }: { canPoll?: boolean }) {
  const feed = useCapturedFeed([], CAPTURE_NOW.toISOString(), canPoll);
  return (
    <output>
      {feed.events.length}:{feed.unavailable ? "unavailable" : "ready"}
    </output>
  );
}
const response = (records = [capturedSpin()]) => ({
  ok: true,
  json: async () => ({ records, generatedAt: CAPTURE_NOW.toISOString() }),
});
beforeEach(() => {
  vi.stubGlobal("fetch", fetcher);
  fetcher.mockReset().mockResolvedValue(response());
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("visible-tab captured feed polling", () => {
  it("never requests an API in read-only/static mode", () => {
    render(<Harness canPoll={false} />);
    expect(screen.getByRole("status").textContent).toBe("0:ready");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("refreshes immediately then every 15 seconds, and aborts/cleans up on unmount", async () => {
    vi.useFakeTimers();
    const view = render(<Harness />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByRole("status").textContent).toBe("1:ready");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000);
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    const signal = fetcher.mock.calls[1][1].signal as AbortSignal;
    view.unmount();
    expect(signal.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(30000);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("retains the last valid snapshot rather than replacing it with a malformed feed", async () => {
    const view = render(<Harness />);
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toBe("1:ready"),
    );
    view.rerender(<Harness canPoll={false} />);
    fetcher.mockResolvedValue({
      ok: true,
      json: async () => ({
        records: [{ source: "captured" }],
        generatedAt: "invalid",
      }),
    });
    view.rerender(<Harness canPoll />);
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toBe("1:unavailable"),
    );
  });
  it("does not poll a hidden tab, and refreshes on return to visibility", async () => {
    const visibility = vi
      .spyOn(document, "visibilityState", "get")
      .mockReturnValue("hidden");
    render(<Harness />);
    expect(fetcher).not.toHaveBeenCalled();
    visibility.mockReturnValue("visible");
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toBe("1:ready"),
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
