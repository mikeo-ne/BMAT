// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "@/components/auth-provider";
import { configureBrowserSession, browserSession } from "@/lib/auth-client";
import type { BrowserSession } from "@/lib/auth-types";
import { defaultNotificationPreferences } from "@/lib/notifications";
import { useNotificationPreferences } from "@/lib/use-notification-preferences";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));
const empty: BrowserSession = { user: null, csrfToken: null, expiresAt: null };
function signedIn(): BrowserSession {
  return {
    user: {
      id: crypto.randomUUID(),
      role: "artist",
      name: "Bootstrap QA",
      email: "bootstrap@example.com",
      mock: false,
      stationIds: [],
    },
    csrfToken: "b".repeat(64),
    expiresAt: "2027-01-01T00:00:00Z",
  };
}
function Preferences() {
  const { loading, config, invalid } = useNotificationPreferences();
  return (
    <p>
      {loading
        ? "Loading private account"
        : invalid
          ? "Load failed"
          : "Ready: " + config.whatsapp.phone}
    </p>
  );
}
beforeEach(() => {
  configureBrowserSession(empty);
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  configureBrowserSession(empty);
  vi.unstubAllGlobals();
});
describe("trusted initial session before child preference effects", () => {
  it("finishes first-load preferences instead of capturing the previous public broker scope forever", async () => {
    const config = defaultNotificationPreferences();
    config.whatsapp.phone = "+256772123456";
    let respond: ((response: Response) => void) | undefined;
    const fetcher = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          respond = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetcher);
    render(
      <AuthProvider initial={signedIn()}>
        <Preferences />
      </AuthProvider>,
    );
    expect(screen.getByText("Loading private account")).toBeTruthy();
    await waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
    await act(async () => {
      respond!(Response.json({ config }));
    });
    expect(await screen.findByText("Ready: +256772123456")).toBeTruthy();
    expect(fetcher.mock.calls[0]).toEqual([
      "/api/preferences",
      expect.objectContaining({
        credentials: "same-origin",
        cache: "no-store",
      }),
    ]);
  });
  it("never writes a request's identity into shared module state during server rendering", () => {
    renderToString(
      <AuthProvider initial={signedIn()}>
        <Preferences />
      </AuthProvider>,
    );
    expect(browserSession()).toEqual(empty);
  });
});
