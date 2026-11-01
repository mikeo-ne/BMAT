// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AirplayTrend } from "@/components/airplay-trend";
import { UgandaAirplayMap } from "@/components/uganda-airplay-map";
import { capturedSpin } from "@/tests/fixtures/captured";

afterEach(cleanup);
const events = [
  capturedSpin({ isrc: null }),
  capturedSpin({
    id: "qa-unmatched",
    trackId: null,
    isrc: null,
    region: "Western",
  }),
];

describe("capture-backed map and trend", () => {
  it("counts a matched recording without an ISRC in its region, not as unmatched audio", () => {
    const select = vi.fn();
    render(
      <UgandaAirplayMap
        events={events}
        focusRegion="All"
        onFocusRegion={select}
      />,
    );
    const central = screen.getByRole("button", {
      name: "Filter to Central region, 1 matched spins",
    });
    expect(central).toBeTruthy();
    expect(
      screen.getByRole("button", {
        name: "Filter to Western region, 0 matched spins",
      }),
    ).toBeTruthy();
    expect(screen.getByText("Capture records only")).toBeTruthy();
    fireEvent.click(central);
    expect(select).toHaveBeenCalledWith("Central");
  });

  it("does not describe an empty production reporting panel as seeded data", () => {
    render(
      <UgandaAirplayMap
        events={[]}
        focusRegion="All"
        onFocusRegion={() => {}}
      />,
    );
    expect(screen.getByText("Awaiting capture records")).toBeTruthy();
    expect(screen.queryByText("Seeded panel data")).toBeNull();
  });

  it("reconciles daily and EAT-hourly trends to matched track IDs even when the ISRC is unknown", () => {
    render(<AirplayTrend events={events} />);
    expect(screen.getByText("matched plays").parentElement!.textContent).toBe(
      "1matched plays",
    );
    expect(screen.getByText(/Captured reporting days/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "hourly" }));
    expect(screen.getByText("matched plays").parentElement!.textContent).toBe(
      "1matched plays",
    );
    expect(screen.getByText(/Hourly distribution in EAT/)).toBeTruthy();
  });
});
