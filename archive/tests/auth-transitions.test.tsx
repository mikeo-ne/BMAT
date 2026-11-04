// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "@/components/auth-provider";
import {
  AUTH_CHANGED,
  browserSession,
  configureBrowserSession,
} from "@/lib/auth-client";
import type { BrowserSession } from "@/lib/auth-types";
const state = vi.hoisted(() => ({
  evict: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("@/lib/browser-cache", () => ({ evictUserCache: state.evict }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: state.replace, refresh: state.refresh }),
}));
const account = (id: string): BrowserSession => ({
  user: {
    id,
    name: id,
    email: id + "@example.com",
    role: "artist",
    stationIds: [],
    mock: false,
  },
  csrfToken: (id === "alpha" ? "a" : "b").repeat(64),
  expiresAt: "2027-01-01T00:00:00Z",
});
const alpha = account("alpha"),
  beta = account("beta");
let finishEviction: (() => void)[];
function Actions() {
  const auth = useAuth(),
    [done, setDone] = useState(false);
  return (
    <>
      <p>{auth.session.user?.id ?? "public"}</p>
      <p>{done ? "Transition finished" : "Transition pending"}</p>
      <button
        onClick={() => {
          void auth.update(beta).then(() => setDone(true));
        }}
      >
        Swap account
      </button>
      <button
        onClick={() => {
          void auth.signOut().then(() => setDone(true));
        }}
      >
        End session
      </button>
    </>
  );
}
beforeEach(() => {
  finishEviction = [];
  state.evict.mockReset();
  state.replace.mockReset();
  state.refresh.mockReset();
  state.evict.mockImplementation(
    () => new Promise<void>((resolve) => finishEviction.push(resolve)),
  );
  configureBrowserSession({ user: null, csrfToken: null, expiresAt: null });
  localStorage.clear();
});
afterEach(async () => {
  cleanup();
  await act(async () => {
    finishEviction.forEach((finish) => finish());
  });
  configureBrowserSession({ user: null, csrfToken: null, expiresAt: null });
  vi.unstubAllGlobals();
});
const view = () =>
  render(
    <AuthProvider initial={alpha}>
      <Actions />
    </AuthProvider>,
  );
describe("account transition fencing before navigation", () => {
  it("immediately removes the old identity, but does not finish a swap until its cache eviction commits", async () => {
    view();
    fireEvent.click(screen.getByRole("button", { name: "Swap account" }));
    expect(browserSession().user?.id).toBe("beta");
    expect(screen.getByText("Transition pending")).toBeTruthy();
    expect(state.evict).toHaveBeenCalledExactlyOnceWith("alpha");
    await act(async () => {
      finishEviction[0]();
    });
    expect(screen.getByText("Transition finished")).toBeTruthy();
  });
  it("does not navigate away from logout while old private snapshots are still being deleted, then returns to the public site", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ ok: true })),
    );
    view();
    fireEvent.click(screen.getByRole("button", { name: "End session" }));
    await waitFor(() => expect(state.evict).toHaveBeenCalledOnce());
    expect(browserSession().user).toBeNull();
    expect(state.replace).not.toHaveBeenCalled();
    await act(async () => {
      finishEviction[0]();
    });
    expect(state.replace).toHaveBeenCalledExactlyOnceWith("/");
  });
  it("ignores a delayed old-cookie refresh after a newer authenticated transition", async () => {
    let respond: ((response: Response) => void) | undefined;
    const fetcher = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          respond = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetcher);
    view();
    act(() => window.dispatchEvent(new Event(AUTH_CHANGED)));
    await waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole("button", { name: "Swap account" }));
    await act(async () => {
      respond!(Response.json(alpha));
    });
    expect(browserSession().user?.id).toBe("beta");
    expect(state.evict).toHaveBeenCalledExactlyOnceWith("alpha");
    await act(async () => {
      finishEviction[0]();
    });
  });
});
