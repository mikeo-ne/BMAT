// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ClaimableStation, StationRequestRow } from "@/lib/db/broadcaster";

/**
 * The onboarding screen is what a broadcaster sees instead of a dashboard, so
 * the states that matter are: nothing linked yet (an explanation, not a dead
 * end), a selectable list of unclaimed stations, and the request history.
 */
const h = vi.hoisted(() => ({
  claimable: [] as ClaimableStation[],
  requests: [] as StationRequestRow[],
  submitted: [] as unknown[],
  fail: null as string | null,
}));

vi.mock("@/lib/db/broadcaster", () => ({
  loadStationSetup: () =>
    Promise.resolve({ live: true, claimable: h.claimable, requests: h.requests }),
  submitStationRequest: async (input: unknown) => {
    if (h.fail) throw new Error(h.fail);
    h.submitted.push(input);
    return { reference: "ok" };
  },
  cancelStationRequest: async () => undefined,
}));

vi.mock("@/lib/supabase/config", () => ({ isSupabaseConfigured: true }));

const { StationSetup } = await import("@/components/dashboards/broadcaster/StationSetup");

const station = (over: Partial<ClaimableStation> = {}): ClaimableStation => ({
  id: "s1",
  name: "Next Radio",
  region: "Central",
  frequency: "106.1",
  kind: "radio",
  ...over,
});

beforeEach(() => {
  h.claimable = [station(), station({ id: "s2", name: "Pearl FM", frequency: "107.9" })];
  h.requests = [];
  h.submitted = [];
  h.fail = null;
});

afterEach(cleanup);

describe("StationSetup", () => {
  it("explains the blocked state instead of just saying 'ask East Sound'", async () => {
    render(<StationSetup hasStation={false} />);
    await waitFor(() => expect(screen.getByText(/No station is linked to your account yet/)).toBeTruthy());
    expect(screen.getByLabelText("Station to claim")).toBeTruthy();
  });

  it("lists only unclaimed stations, with frequency and region", async () => {
    render(<StationSetup hasStation={false} />);
    await waitFor(() => expect(screen.getByText("Next Radio · 106.1 · Central")).toBeTruthy());
    expect(screen.getByText("Pearl FM · 107.9 · Central")).toBeTruthy();
  });

  it("sends a claim request for the chosen station", async () => {
    render(<StationSetup hasStation={false} />);
    await waitFor(() => screen.getByLabelText("Station to claim"));
    fireEvent.change(screen.getByLabelText("Station to claim"), { target: { value: "s2" } });
    fireEvent.click(screen.getByText("Request this station"));
    await waitFor(() => expect(h.submitted).toHaveLength(1));
    expect(h.submitted[0]).toMatchObject({ mode: "claim", stationId: "s2" });
    expect(screen.getByText(/A CMO will confirm/)).toBeTruthy();
  });

  it("switches to a new-station form and previews the panel id", async () => {
    render(<StationSetup hasStation={false} />);
    await waitFor(() => screen.getByText("Add a new station"));
    fireEvent.click(screen.getByText("Add a new station"));
    fireEvent.change(screen.getByPlaceholderText("e.g. Next Radio"), { target: { value: "UBC TV" } });
    expect(screen.getByText("Panel id: ubc-tv")).toBeTruthy();
    fireEvent.click(screen.getByText("Submit station"));
    await waitFor(() => expect(h.submitted).toHaveLength(1));
    expect(h.submitted[0]).toMatchObject({ mode: "new", name: "UBC TV" });
  });

  it("shows the request history with status and a cancel action", async () => {
    h.requests = [
      { id: "r1", status: "pending", kind: "radio", name: "Next Radio", frequency: "106.1", region: "Central", streamUrl: null, note: null, createdAt: "2026-11-10", reviewNote: null },
      { id: "r2", status: "approved", kind: "radio", name: "Pearl FM", frequency: "107.9", region: "Central", streamUrl: null, note: null, createdAt: "2026-11-09", reviewNote: null },
    ];
    render(<StationSetup hasStation />);
    await waitFor(() => expect(screen.getByText("Your requests")).toBeTruthy());
    expect(screen.getByText("pending")).toBeTruthy();
    expect(screen.getByText("approved")).toBeTruthy();
    // Only a pending request can be cancelled.
    expect(screen.getAllByText("Cancel")).toHaveLength(1);
  });

  it("surfaces a validation error from the server instead of failing silently", async () => {
    h.fail = "Give the station its full name (at least 2 characters).";
    render(<StationSetup hasStation={false} />);
    await waitFor(() => screen.getByText("Request this station"));
    fireEvent.change(screen.getByLabelText("Station to claim"), { target: { value: "s1" } });
    fireEvent.click(screen.getByText("Request this station"));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/full name/));
  });
});
