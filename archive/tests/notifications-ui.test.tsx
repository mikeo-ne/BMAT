// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AlertsView } from "@/components/alerts-view";
import {
  NOTIFICATION_STORAGE_KEY,
  defaultNotificationPreferences,
  type NotificationPreferences,
} from "@/lib/notifications";
import {
  readNotificationPreferences,
  saveNotificationPreferences,
} from "@/lib/use-notification-preferences";
import { configureBrowserSession, PRIVATE_EVICT } from "@/lib/auth-client";
import type { BrowserSession } from "@/lib/auth-types";
import {
  CAPTURE_NOW,
  optedInPreferences,
  REFERENCE_CATALOGUE,
} from "@/tests/fixtures/captured";
const auth = vi.hoisted(() => ({
  session: { user: null, csrfToken: null, expiresAt: null } as BrowserSession,
}));
vi.mock("@/components/auth-provider", () => ({ useAuth: () => auth }));
const fetcher = vi.fn();
let stored: NotificationPreferences;
beforeEach(() => {
  localStorage.clear();
  stored = defaultNotificationPreferences();
  auth.session = {
    user: {
      id: crypto.randomUUID(),
      name: "Quality UI Account",
      email: "quality@example.com",
      role: "artist",
      stationIds: [],
      mock: false,
    },
    csrfToken: "a".repeat(64),
    expiresAt: "2027-01-01T00:00:00Z",
  };
  configureBrowserSession(auth.session);
  fetcher.mockReset();
  fetcher.mockImplementation(async (input: string, init?: RequestInit) => {
    if (input === "/api/preferences") {
      if (init?.method === "PUT") {
        stored = JSON.parse(String(init.body));
        stored.webhooks = stored.webhooks.map(({ secret, ...h }) => ({
          ...h,
          secretConfigured: !!secret || h.secretConfigured,
        }));
      }
      return { ok: true, status: 200, json: async () => ({ config: stored }) };
    }
    if (input === "/api/notifications/outbox")
      return { ok: true, status: 200, json: async () => ({ jobs: [] }) };
    throw new Error("Unexpected external request: " + input);
  });
  vi.stubGlobal("fetch", fetcher);
});
afterEach(() => {
  cleanup();
  if (auth.session.user)
    window.dispatchEvent(
      new CustomEvent(PRIVATE_EVICT, { detail: auth.session.user.id }),
    );
  configureBrowserSession({ user: null, csrfToken: null, expiresAt: null });
  vi.unstubAllGlobals();
});
async function view() {
  await act(async () => {
    render(
      <AlertsView
        catalogue={REFERENCE_CATALOGUE}
        now={CAPTURE_NOW.toISOString()}
      />,
    );
  });
}
const activeKpi = () =>
  screen
    .getByText("Active notification subscriptions", { exact: true })
    .parentElement!.parentElement!.querySelector("dd")!.textContent;
describe("authenticated alert preferences and honest phone simulation", () => {
  it("loads only private preferences/outbox and ignores legacy unscoped local settings", async () => {
    localStorage.setItem(
      NOTIFICATION_STORAGE_KEY,
      JSON.stringify(optedInPreferences()),
    );
    await view();
    expect(activeKpi()).toBe("0");
    expect(fetcher.mock.calls.map((c) => c[0]).sort()).toEqual([
      "/api/notifications/outbox",
      "/api/preferences",
    ]);
    expect(screen.getByLabelText("WhatsApp phone simulator")).toBeTruthy();
    expect(screen.getByText(/no message is sent/)).toBeTruthy();
  });
  it("validates +256 and opt-in, then saves to the server without claiming a real provider connection", async () => {
    await view();
    fireEvent.click(screen.getByRole("button", { name: "Configure channels" }));
    const dialog = screen.getByRole("dialog", {
        name: "Airplay Alerts & Webhooks",
      }),
      phone = within(dialog).getByLabelText(/WhatsApp phone number/);
    fireEvent.change(phone, { target: { value: "+2560772123456" } });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Save channel settings" }),
    );
    expect(within(dialog).getByRole("alert").textContent).toMatch(
      /international WhatsApp number/,
    );
    fireEvent.change(phone, { target: { value: "+256 772 123456" } });
    fireEvent.click(within(dialog).getByLabelText(/recipient’s permission/));
    await act(async () =>
      fireEvent.click(
        within(dialog).getByRole("button", { name: "Save channel settings" }),
      ),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(readNotificationPreferences().whatsapp).toMatchObject({
      phone: "+256772123456",
      consent: true,
    });
    expect(stored.whatsapp.consent).toBe(true);
    expect(localStorage.getItem(NOTIFICATION_STORAGE_KEY)).toBeNull();
    expect(screen.getByText(/live delivery is not connected/)).toBeTruthy();
  });
  it("creates, pauses, resumes, edits and removes a server-persisted subscription", async () => {
    stored = optedInPreferences();
    stored.subscriptions = [];
    await view();
    fireEvent.click(screen.getByRole("button", { name: "New subscription" }));
    let dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Subscription name"), {
      target: { value: "SALO campaign" },
    });
    await act(async () =>
      fireEvent.click(
        within(dialog).getByRole("button", { name: "Save subscription" }),
      ),
    );
    await waitFor(() => expect(activeKpi()).toBe("1"));
    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", { name: "Pause SALO campaign" }),
      ),
    );
    expect(activeKpi()).toBe("0");
    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", { name: "Resume SALO campaign" }),
      ),
    );
    expect(activeKpi()).toBe("1");
    fireEvent.click(screen.getByRole("button", { name: "Edit SALO campaign" }));
    dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Subscription name"), {
      target: { value: "Updated campaign" },
    });
    await act(async () =>
      fireEvent.click(
        within(dialog).getByRole("button", { name: "Save subscription" }),
      ),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Delete Updated campaign" }),
    );
    await act(async () =>
      fireEvent.click(
        within(screen.getByRole("dialog")).getByRole("button", {
          name: "Delete subscription",
        }),
      ),
    );
    expect(activeKpi()).toBe("0");
    expect(stored.subscriptions).toEqual([]);
    expect(
      fetcher.mock.calls.some((c) => (c[1] as RequestInit)?.method === "PUT"),
    ).toBe(true);
  });
  it("previews named demo messages and audible samples without creating captured spins or posting to an outbox", async () => {
    await view();
    const before = fetcher.mock.calls.length;
    fireEvent.click(
      screen.getByRole("button", { name: "Log demo spin & preview WhatsApp" }),
    );
    expect(
      await screen.findByText(
        "🔥 Airplay Alert! 'Mulongo' just played on Capital FM (Kampala)",
      ),
    ).toBeTruthy();
    expect(fetcher.mock.calls.length).toBe(before);
    expect(
      screen
        .getByLabelText("Ten-second generated demonstration sample")
        .getAttribute("src"),
    ).toBe("/demo/east-sound-sample.wav");
    expect(
      screen.getByText(/Demo records never enter live totals/),
    ).toBeTruthy();
  });
  it("never stores a webhook secret in the returned client preference snapshot", async () => {
    await view();
    const config = defaultNotificationPreferences();
    config.webhooks = [
      {
        id: "label",
        label: "Label",
        url: "https://hooks.example.com/airplay",
        kind: "json",
        enabled: true,
        secret: "test-only-write-only-signing-secret-123456789",
      },
    ];
    await act(async () => {
      await saveNotificationPreferences(config);
    });
    expect(readNotificationPreferences().webhooks[0].secret).toBeUndefined();
    expect(readNotificationPreferences().webhooks[0].secretConfigured).toBe(
      true,
    );
    expect(localStorage.getItem(NOTIFICATION_STORAGE_KEY)).toBeNull();
  });
  it("does not trust corrupt localStorage or another tab's role/preferences as account authority", async () => {
    localStorage.setItem(NOTIFICATION_STORAGE_KEY, "not-json");
    await view();
    act(() => {
      localStorage.setItem(
        NOTIFICATION_STORAGE_KEY,
        JSON.stringify(optedInPreferences()),
      );
      window.dispatchEvent(
        new StorageEvent("storage", { key: NOTIFICATION_STORAGE_KEY }),
      );
    });
    expect(activeKpi()).toBe("0");
    expect(readNotificationPreferences().subscriptions).toEqual([]);
  });
});
