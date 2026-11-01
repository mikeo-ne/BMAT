// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NationalCharts } from "@/components/national-charts";
import { UnidentifiedQueue } from "@/components/unidentified-queue";
import { buildWeeklyChart } from "@/lib/charts";

afterEach(cleanup);

describe("empty capture views do not claim successful matches or chart activity", () => {
  it("does not manufacture a podium when no recording has captured plays", () => {
    render(
      <NationalCharts
        chart={buildWeeklyChart([], new Date("2026-11-01T00:00:00Z"))}
      />,
    );
    expect(
      screen.getByText(
        "No captured plays are available to rank in this reporting window.",
      ),
    ).toBeTruthy();
    expect(screen.queryByText("Only the podium charted this week.")).toBeNull();
  });
  it("does not treat an empty unidentified queue as proof of captured or identified audio", () => {
    render(
      <UnidentifiedQueue
        segments={[]}
        links={[]}
        onTag={vi.fn()}
        onSeek={vi.fn()}
      />,
    );
    expect(
      screen.getByText(
        /An empty queue does not establish that a station hour was captured or matched/,
      ),
    ).toBeTruthy();
    expect(
      screen.queryByText("Every segment in this hour was matched confidently."),
    ).toBeNull();
  });
});
