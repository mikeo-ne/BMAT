// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WhatsAppAlerts } from "@/components/dashboard/WhatsAppAlerts";

/**
 * "Did anything actually get sent?" is the question a label asks after turning
 * alerts on. The settings panel answers it with the real outbox rows, including
 * the ones that failed — a silent queue is worse than a visible failure.
 */
const log = vi.hoisted(() => ({ rows: [] as unknown[], prefs: {} as unknown }));

vi.mock("@/lib/auth-context", () => ({ DEMO_MODE: false }));
vi.mock("@/lib/db/shared", () => ({
  loadAlertPrefs: async () => log.prefs,
  saveAlertPrefs: async () => undefined,
  loadAlertLog: async () => log.rows,
  toE164: (phone: string) => (/^\+2567\d{8}$/.test(phone) ? phone : null),
}));

const row = (over: Record<string, unknown> = {}) => ({
  id: "a1",
  kind: "firstspin",
  title: "First spin on Capital FM",
  created_at: "2026-11-04T09:00:00Z",
  sent_at: "2026-11-04T09:01:00Z",
  channel: "whatsapp",
  last_error: null,
  attempts: 0,
  ...over,
});

beforeEach(() => {
  log.prefs = { phone: "+256772123456", events: { firstSpin: true, chart: true, dispute: true, payout: false } };
  log.rows = [];
});

afterEach(cleanup);

describe("WhatsAppAlerts delivery log", () => {
  it("shows what was sent, and through which channel", async () => {
    log.rows = [row()];
    render(<WhatsAppAlerts scope="artist" />);
    expect(await screen.findByText("First spin on Capital FM")).toBeTruthy();
    expect(screen.getByText("Sent by WhatsApp")).toBeTruthy();
  });

  it("admits when a message could not be delivered", async () => {
    log.rows = [row({ sent_at: "2026-11-04T09:01:00Z", channel: null, last_error: "this person has no reachable phone or email" })];
    render(<WhatsAppAlerts scope="artist" />);
    expect(await screen.findByText(/Not delivered — this person has no reachable/)).toBeTruthy();
  });

  it("explains an empty log instead of showing nothing", async () => {
    render(<WhatsAppAlerts scope="artist" />);
    expect(await screen.findByText(/Nothing yet\. The first message arrives/)).toBeTruthy();
  });

  it("keeps the saved number in the field", async () => {
    render(<WhatsAppAlerts scope="artist" />);
    await waitFor(() => expect((screen.getByLabelText("WhatsApp number") as HTMLInputElement).value).toBe("+256772123456"));
  });
});
