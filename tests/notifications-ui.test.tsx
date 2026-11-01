// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AlertsView } from "@/components/alerts-view";
import { NOTIFICATION_STORAGE_KEY } from "@/lib/notifications";
import {
  readNotificationPreferences,
  saveNotificationPreferences,
} from "@/lib/use-notification-preferences";
import {
  CAPTURE_NOW,
  optedInPreferences,
  REFERENCE_CATALOGUE,
} from "@/tests/fixtures/captured";

const fetcher = vi.fn();
beforeEach(() => {
  localStorage.clear();
  window.dispatchEvent(new StorageEvent("storage", { key: null }));
  vi.stubGlobal("fetch", fetcher);
  fetcher.mockReset();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const view = () =>
  render(
    <AlertsView
      catalogue={REFERENCE_CATALOGUE}
      now={CAPTURE_NOW.toISOString()}
    />,
  );
const activeKpi = () =>
  screen
    .getByText("Active notification subscriptions", { exact: true })
    .parentElement!.parentElement!.querySelector("dd")!.textContent;

describe("Airplay Alerts & Webhooks notification center", () => {
  it("starts unconfigured with real release metadata, five KPIs and no browser network requests", () => {
    view();
    expect(activeKpi()).toBe("0");
    expect(
      screen.getByRole("button", { name: "Configure channels" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Test WhatsApp Notification" }),
    ).toBeTruthy();
    expect(screen.getAllByRole("tab")).toHaveLength(3);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("validates +256 and opt-in in the setup dialog without pretending to connect a provider", () => {
    view();
    fireEvent.click(screen.getByRole("button", { name: "Configure channels" }));
    const dialog = screen.getByRole("dialog", {
      name: "Airplay Alerts & Webhooks",
    });
    const phone = within(dialog).getByLabelText(/WhatsApp phone number/);
    fireEvent.change(phone, { target: { value: "+2560772123456" } });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Save channel settings" }),
    );
    expect(within(dialog).getByRole("alert").textContent).toMatch(
      /international WhatsApp number/,
    );
    fireEvent.change(phone, { target: { value: "+256 772 123456" } });
    fireEvent.click(within(dialog).getByLabelText(/recipient’s permission/));
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Save channel settings" }),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(readNotificationPreferences().whatsapp).toMatchObject({
      phone: "+256772123456",
      consent: true,
    });
    expect(screen.getByText(/live delivery is not connected/)).toBeTruthy();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("creates, edits, pauses, resumes and deletes a subscription with an immediately shared KPI", () => {
    const config = optedInPreferences();
    config.subscriptions = [];
    saveNotificationPreferences(config);
    view();
    fireEvent.click(screen.getByRole("button", { name: "New subscription" }));
    let dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Subscription name"), {
      target: { value: "SALO release campaign" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Save subscription" }),
    );
    expect(activeKpi()).toBe("1");
    fireEvent.click(
      screen.getByRole("button", { name: "Pause SALO release campaign" }),
    );
    expect(activeKpi()).toBe("0");
    fireEvent.click(
      screen.getByRole("button", { name: "Resume SALO release campaign" }),
    );
    expect(activeKpi()).toBe("1");
    expect(
      readNotificationPreferences().subscriptions[0].activatedAt,
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Edit SALO release campaign" }),
    );
    dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Subscription name"), {
      target: { value: "Updated campaign" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Save subscription" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Delete Updated campaign" }),
    );
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Delete subscription",
      }),
    );
    expect(activeKpi()).toBe("0");
    expect(readNotificationPreferences().subscriptions).toEqual([]);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("previews first-play, milestone and prime-time messages without adding audited spins", () => {
    view();
    fireEvent.click(
      screen.getByRole("button", { name: "Test WhatsApp Notification" }),
    );
    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByLabelText("Simulated WhatsApp notification")
        .textContent,
    ).toContain("TEST — SIMULATED AIRPLAY");
    const triggers = within(dialog).getByRole("group", {
      name: "Test notification trigger",
    });
    for (const button of within(triggers).getAllByRole("button"))
      fireEvent.click(button);
    expect(
      within(dialog).getByLabelText("Simulated WhatsApp notification")
        .textContent,
    ).toContain(REFERENCE_CATALOGUE[0].title);
    expect(localStorage.getItem(NOTIFICATION_STORAGE_KEY)).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("reports invalid saved settings without overwriting them, and syncs a second browser tab", () => {
    localStorage.setItem(NOTIFICATION_STORAGE_KEY, "not-json");
    view();
    expect(screen.getByRole("alert").textContent).toMatch(
      /not been silently overwritten/,
    );
    expect(localStorage.getItem(NOTIFICATION_STORAGE_KEY)).toBe("not-json");
    act(() => {
      localStorage.setItem(
        NOTIFICATION_STORAGE_KEY,
        JSON.stringify(optedInPreferences()),
      );
      window.dispatchEvent(
        new StorageEvent("storage", { key: NOTIFICATION_STORAGE_KEY }),
      );
    });
    expect(activeKpi()).toBe("1");
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
