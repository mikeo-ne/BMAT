// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EARLY_ACCESS, PAYMENTS_ENABLED, dueNow, findPlan, planAmount } from "@/lib/plans";

/**
 * Payments are paused while the panel grows. The UI must not ask for money,
 * must not store an amount due, and must say plainly that nothing is charged —
 * the moment this drifts, early access becomes a promise we broke.
 */
const h = vi.hoisted(() => ({ inserted: [] as Record<string, unknown>[], openAuth: vi.fn() }));

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ session: { userId: "user-1", role: "artist" }, openAuth: h.openAuth }),
}));

vi.mock("@/lib/db/core", () => ({
  db: () => ({
    from: () => ({
      insert: async (row: Record<string, unknown>) => {
        h.inserted.push(row);
        return { error: null };
      },
    }),
  }),
}));

const { PlanRequest } = await import("@/components/site/PlanRequest");

afterEach(() => {
  cleanup();
  h.inserted = [];
  h.openAuth.mockReset();
});

describe("early access defaults", () => {
  it("has payments off unless the environment says otherwise", () => {
    expect(PAYMENTS_ENABLED).toBe(false);
    expect(EARLY_ACCESS.active).toBe(true);
  });

  it("charges nothing today, while still publishing the future price", () => {
    const artist = findPlan("artist")!;
    expect(dueNow(artist, "monthly")).toBe(0);
    expect(planAmount(artist, "monthly")).toBe(35_000);
  });
});

describe("PlanRequest during early access", () => {
  it("offers a free join, not a purchase", () => {
    render(<PlanRequest plan={findPlan("artist")!} />);
    expect(screen.getByText(/Free during early access/)).toBeTruthy();
    expect(screen.getByText("Join Artist — free for now")).toBeTruthy();
    expect(screen.queryByText(/Start Artist/)).toBeNull();
    expect(screen.getByText(/No card, no mobile money, no invoice/)).toBeTruthy();
  });

  it("records a zero-amount signup tagged as early access", async () => {
    render(<PlanRequest plan={findPlan("artist")!} />);
    fireEvent.click(screen.getByText("Join Artist — free for now"));
    await waitFor(() => expect(h.inserted).toHaveLength(1));
    expect(h.inserted[0]).toMatchObject({ plan: "artist", amount_ugx: 0, billing: "monthly" });
    expect(String(h.inserted[0].note)).toContain("[early access]");
    expect(h.inserted[0].reference).toMatch(/^ES-ART-/);
  });

  it("does not require a phone number, but accepts a valid one as contact", async () => {
    render(<PlanRequest plan={findPlan("label")!} />);
    fireEvent.change(screen.getByLabelText("Contact number for the Label plan"), { target: { value: "0772 123 456" } });
    fireEvent.click(screen.getByText("Join Label — free for now"));
    await waitFor(() => expect(h.inserted).toHaveLength(1));
    expect(h.inserted[0].msisdn).toBe("+256772123456");
  });

  it("still rejects an obviously wrong number", async () => {
    render(<PlanRequest plan={findPlan("label")!} />);
    fireEvent.change(screen.getByLabelText("Contact number for the Label plan"), { target: { value: "0414 123 456" } });
    fireEvent.click(screen.getByText("Join Label — free for now"));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/Ugandan mobile/));
    expect(h.inserted).toHaveLength(0);
  });

  it("confirms that nothing was charged", async () => {
    render(<PlanRequest plan={findPlan("artist")!} />);
    fireEvent.click(screen.getByText("Join Artist — free for now"));
    await waitFor(() => expect(screen.getByText(/You're on the list/)).toBeTruthy());
    expect(screen.getByText(/Nothing has been charged and no card details were taken/)).toBeTruthy();
  });
});
