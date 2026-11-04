// @vitest-environment jsdom
import type { ComponentProps } from "react";
import { useState } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BrowserSession, AccountRole } from "@/lib/auth-types";
import { DashboardShell } from "@/components/dashboard-shell";
import { useArtistNavigation } from "@/components/artist-navigation";
const nav = vi.hoisted(() => ({
  pathname: "/dashboard/charts",
  push: vi.fn(),
}));
const auth = vi.hoisted(() => ({
  session: { user: null, csrfToken: null, expiresAt: null } as BrowserSession,
  signOut: vi.fn(async () => {}),
}));
vi.mock("@/components/auth-provider", () => ({ useAuth: () => auth }));
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ push: nav.push }),
}));
vi.mock("next/link", () => ({
  default: (props: ComponentProps<"a">) => <a {...props} />,
}));
vi.mock("@/components/notification-config-dialog", () => ({
  NotificationSettingsLauncher: () => (
    <button>Configure Airplay Alerts & Webhooks</button>
  ),
}));
vi.mock("@/components/onboarding-guide", () => ({
  OnboardingGuide: () => <button>Quick guide</button>,
}));
function assigned(role: AccountRole) {
  auth.session = {
    user: {
      id: "server-user",
      name: "Quality Account",
      email: "quality@example.com",
      role,
      stationIds: role === "broadcaster" ? ["capital-kla"] : [],
      mock: false,
    },
    csrfToken: "a".repeat(64),
    expiresAt: "2027-01-01T00:00:00Z",
  };
}
function Draft() {
  const [view] = useArtistNavigation("overview"),
    [draft, setDraft] = useState("");
  return (
    <>
      <p>Artist view: {view}</p>
      <input
        aria-label="Staged metadata"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
      />
    </>
  );
}
const shell = () => (
  <DashboardShell panelSize={32} fm={32} tv={1}>
    <Draft />
  </DashboardShell>
);
beforeEach(() => {
  nav.pathname = "/dashboard/charts";
  nav.push.mockReset();
  auth.signOut.mockClear();
  auth.session = { user: null, csrfToken: null, expiresAt: null };
  localStorage.clear();
  window.history.replaceState(null, "", "/dashboard/charts");
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
describe("server-session dashboard navigation", () => {
  it("has no privilege selector and ignores both legacy and forged localStorage roles", () => {
    localStorage.setItem("east-sound:workspace", "cmo");
    localStorage.setItem(
      "east-sound:session-display:v1",
      JSON.stringify({ id: "forged", role: "cmo" }),
    );
    render(shell());
    expect(screen.queryByLabelText("Switch workspace")).toBeNull();
    expect(screen.getByText("No signed-in session")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Sign in" })).toBeTruthy();
    const menu = within(screen.getByRole("navigation", { name: "Dashboard" }));
    expect(
      menu.getAllByRole("link").map((a) => a.getAttribute("href")),
    ).toEqual(["/dashboard/charts", "/dashboard/stats"]);
    expect(screen.getByText(/32 FM · 1 TV directory entries/)).toBeTruthy();
  });
  it("shows the assigned artist workspace and no auditor or station modules", () => {
    assigned("artist");
    nav.pathname = "/dashboard/artist/catalogue";
    render(shell());
    const menu = within(screen.getByRole("navigation", { name: "Dashboard" }));
    expect(
      menu
        .getByRole("link", { name: "My catalogue & ISRC" })
        .getAttribute("aria-current"),
    ).toBe("page");
    expect(menu.queryByRole("link", { name: /CMO overview/ })).toBeNull();
    expect(
      menu.queryByRole("link", { name: "Station playout logs" }),
    ).toBeNull();
    expect(screen.getByText("quality@example.com")).toBeTruthy();
    expect(
      screen.getByRole("button", {
        name: "Configure Airplay Alerts & Webhooks",
      }),
    ).toBeTruthy();
  });
  it("limits broadcaster navigation to station workspaces plus public modules", () => {
    assigned("broadcaster");
    nav.pathname = "/dashboard/advertisers";
    localStorage.setItem("east-sound:workspace", "artist");
    render(shell());
    const menu = within(screen.getByRole("navigation", { name: "Dashboard" }));
    expect(
      menu
        .getByRole("link", { name: "Ad campaign auditor" })
        .getAttribute("aria-current"),
    ).toBe("page");
    expect(
      menu.getByRole("link", { name: "Station playout logs" }),
    ).toBeTruthy();
    expect(menu.queryByRole("link", { name: "Deliver a master" })).toBeNull();
    expect(
      screen.queryByRole("button", {
        name: "Configure Airplay Alerts & Webhooks",
      }),
    ).toBeNull();
  });
  it("never promotes a guest after a compatible-looking storage event", () => {
    render(shell());
    act(() => {
      localStorage.setItem("east-sound:workspace", "cmo");
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "east-sound:workspace",
          newValue: "cmo",
        }),
      );
    });
    expect(
      within(screen.getByRole("navigation", { name: "Dashboard" })).queryByRole(
        "link",
        { name: /CMO/ },
      ),
    ).toBeNull();
    expect(nav.push).not.toHaveBeenCalled();
  });
  it("keeps authoritative navigation when local storage is blocked", () => {
    assigned("cmo");
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("Blocked");
    });
    render(shell());
    expect(screen.getByText("CMO Auditor")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
    expect(screen.queryByLabelText("Switch workspace")).toBeNull();
  });
  it("uses native artist history without resetting a staged draft, query or base path", () => {
    assigned("artist");
    nav.pathname = "/BMAT/dashboard/artist/catalogue/";
    window.history.replaceState(
      null,
      "",
      "/BMAT/dashboard/artist/catalogue/?draft=local#artist=baranga",
    );
    const history = vi.spyOn(window.history, "pushState"),
      { rerender } = render(shell());
    fireEvent.change(screen.getByLabelText("Staged metadata"), {
      target: { value: "Unsaved master title" },
    });
    fireEvent.click(screen.getByRole("link", { name: "Deliver a master" }));
    expect(
      window.location.pathname + window.location.search + window.location.hash,
    ).toBe("/BMAT/dashboard/artist/delivery/?draft=local");
    expect(nav.push).not.toHaveBeenCalled();
    nav.pathname = "/BMAT/dashboard/artist/delivery/";
    rerender(shell());
    expect(screen.getByText("Artist view: delivery")).toBeTruthy();
    expect(
      (screen.getByLabelText("Staged metadata") as HTMLInputElement).value,
    ).toBe("Unsaved master title");
    fireEvent.click(screen.getByRole("link", { name: "Deliver a master" }));
    expect(history).toHaveBeenCalledTimes(1);
  });
  it("calls real session sign-out instead of selecting a public view", async () => {
    assigned("artist");
    render(shell());
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Sign out" })),
    );
    expect(auth.signOut).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem("east-sound:workspace")).toBeNull();
  });
  it("traps mobile navigation and restores focus after Escape", () => {
    render(shell());
    const opener = screen.getByRole("button", { name: "Open navigation" });
    opener.focus();
    fireEvent.click(opener);
    const dialog = screen.getByRole("dialog", { name: "Workspace navigation" });
    expect(document.body.style.overflow).toBe("hidden");
    expect(dialog.contains(document.activeElement)).toBe(true);
    const items = dialog.querySelectorAll<HTMLElement>(
      "a[href], button:not(:disabled), select",
    );
    items[items.length - 1].focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(items[0]);
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(items[items.length - 1]);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.body.style.overflow).toBe("");
    expect(document.activeElement).toBe(opener);
  });
});
