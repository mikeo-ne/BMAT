// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AirplayChart } from "@/components/site/AirplayChart";

/**
 * The public chart is the first thing a visitor sees, and it has to be honest
 * in three very different worlds:
 *   demo mode       — placeholder rows, sample label
 *   live, no plays  — the worker just started; the chart is warming up
 *   live, plays     — real detections, evidence held back for rights holders
 */
const state = vi.hoisted(() => ({
  current: {} as { data?: unknown; loading?: boolean; error?: string },
}));

vi.mock("@/lib/db/core", () => ({ useLoad: () => state.current }));
vi.mock("@/lib/i18n", () => ({ useI18n: () => ({ t: (k: string) => k }) }));

const row = (rank: number, title: string, spins: number) => ({
  rank,
  title,
  artist: "Test Artist",
  spins,
  move: 0,
  seed: rank,
});

const set = (next: { data?: unknown; loading?: boolean; error?: string }) => {
  state.current = next;
};

afterEach(() => {
  cleanup();
  set({});
});

describe("AirplayChart", () => {
  it("says the chart is warming up when monitoring is live but nothing has charted", () => {
    set({ data: { live: true, rows: [] } });
    render(<AirplayChart />);
    expect(screen.getByText("Monitoring is on — the chart is warming up.")).toBeTruthy();
    expect(screen.getByText(/within seconds of airplay/)).toBeTruthy();
  });

  it("keeps the demo empty state plain", () => {
    set({ data: { live: false, rows: [] } });
    render(<AirplayChart />);
    expect(screen.getByText("No plays detected in this region yet this week.")).toBeTruthy();
    expect(screen.queryByText(/warming up/)).toBeNull();
  });

  it("tells the visitor to retry when the chart request fails", () => {
    set({ data: undefined, error: "network down" });
    render(<AirplayChart />);
    expect(screen.getByText(/The chart is unavailable right now/)).toBeTruthy();
  });

  it("renders live rows without evidence players, which stay behind the login", () => {
    set({ data: { live: true, rows: [row(1, "Kampala Nights", 42), row(2, "Nile Breeze", 31)] } });
    render(<AirplayChart />);
    expect(screen.getByText("Kampala Nights")).toBeTruthy();
    expect(screen.getByText("42")).toBeTruthy();
    expect(screen.queryByLabelText(/Play 10-second evidence for/)).toBeNull();
    expect(screen.getByText(/Evidence clips are available to rights holders/)).toBeTruthy();
  });

  it("offers a playable sample per row in demo mode", () => {
    set({ data: { live: false, rows: [row(1, "Sample Song", 9)] } });
    render(<AirplayChart />);
    expect(screen.getByLabelText("Play 10-second evidence for Sample Song")).toBeTruthy();
    expect(screen.getByText(/Sample chart/)).toBeTruthy();
  });

  it("dims the list while a reload is in flight instead of blanking it", () => {
    set({ data: { live: true, rows: [row(1, "Kampala Nights", 42)] }, loading: true });
    const { container } = render(<AirplayChart />);
    expect(screen.getByText("Kampala Nights")).toBeTruthy();
    expect(container.querySelector(".opacity-60")).toBeTruthy();
  });
});
