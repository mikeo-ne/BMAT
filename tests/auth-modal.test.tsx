// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthMode } from "@/lib/auth-context";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/",
}));

/**
 * The auth modal is the front door: the role picked here decides which
 * dashboard — and therefore which isolated data module — the visitor lands in,
 * so the "no role, no entry" rule is a security boundary, not a nicety.
 */
const h = vi.hoisted(() => ({
  modal: null as AuthMode | null,
  closeAuth: vi.fn(),
  openAuth: vi.fn(),
  signIn: vi.fn(),
  signUp: vi.fn(),
  requestPasswordReset: vi.fn(),
}));

const subscribers = new Set<() => void>();

vi.mock("@/lib/auth-context", async () => {
  const React = await import("react");
  const subscribe = (cb: () => void) => {
    subscribers.add(cb);
    return () => subscribers.delete(cb);
  };
  return {
    DEMO_MODE: true,
    useAuth: () => {
      const modal = React.useSyncExternalStore(
        subscribe,
        () => h.modal,
        () => h.modal,
      );
      return {
        modal,
        closeAuth: h.closeAuth,
        openAuth: h.openAuth,
        signIn: h.signIn,
        signUp: h.signUp,
        requestPasswordReset: h.requestPasswordReset,
      };
    },
  };
});

import { AuthModal } from "@/components/site/AuthModal";

/** The modal autofocuses the email field ~30ms after opening; type after that
 *  settles or a stray focus change will split words across fields. */
const renderSettled = async () => {
  const utils = render(<AuthModal />);
  if (h.modal !== "forgot") {
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText("Email")));
  }
  return utils;
};

const setModal = (mode: AuthMode | null) => {
  h.modal = mode;
  subscribers.forEach((cb) => cb());
};

/** "Sign In" names both the tab and the submit button — always click the form's. */
const submitButton = () => {
  const btn = screen.getByRole("dialog").querySelector('button[type="submit"]');
  if (!btn) throw new Error("submit button missing");
  return btn as HTMLButtonElement;
};

beforeEach(() => {
  h.modal = "signin";
  h.closeAuth.mockReset();
  h.openAuth.mockReset().mockImplementation((m: AuthMode) => setModal(m));
  h.signIn.mockReset();
  h.signUp.mockReset();
  h.requestPasswordReset.mockReset();
  push.mockReset();
});

afterEach(cleanup);

describe("AuthModal", () => {
  it("titles each mode", () => {
    render(<AuthModal />);
    expect(screen.getByRole("heading", { name: "Sign in to your workspace" })).toBeTruthy();
    cleanup();
    h.modal = "signup";
    render(<AuthModal />);
    expect(screen.getByRole("heading", { name: "Create your workspace" })).toBeTruthy();
    cleanup();
    h.modal = "forgot";
    render(<AuthModal />);
    expect(screen.getByRole("heading", { name: "Recover your password" })).toBeTruthy();
  });

  it("renders nothing when no mode is open", () => {
    h.modal = null;
    render(<AuthModal />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("offers every role in the use case picker", () => {
    render(<AuthModal />);
    const options = Array.from(
      (screen.getByLabelText(/Select your use case/i) as HTMLSelectElement).options,
    ).map((o) => o.textContent);
    expect(options).toEqual(
      expect.arrayContaining(["CMO / Auditor", "Record Label", "Independent Artist", "Broadcaster", "Venue Operator"]),
    );
  });

  it("refuses to sign in without a role", async () => {
    const user = userEvent.setup();
    await renderSettled();
    await user.type(screen.getByLabelText("Email"), "cmo@example.com");
    await user.type(screen.getByLabelText("Password"), "secret123");
    await user.click(submitButton());

    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "Select your use case / role to continue.",
    );
    expect(h.signIn).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("explains the selected role", async () => {
    const user = userEvent.setup();
    await renderSettled();
    await user.selectOptions(screen.getByLabelText(/Select your use case/i), "label");
    expect(screen.getByText("Roster, masters, ISRC/UPC catalogue and label revenue.")).toBeTruthy();
  });

  it("routes a signed-in user to their own dashboard", async () => {
    h.signIn.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    await renderSettled();
    await user.selectOptions(screen.getByLabelText(/Select your use case/i), "broadcaster");
    await user.type(screen.getByLabelText("Email"), "  studio@example.com  ");
    await user.type(screen.getByLabelText("Password"), "secret123");
    await user.click(submitButton());

    await waitFor(() => expect(h.signIn).toHaveBeenCalledWith("studio@example.com", "secret123", "broadcaster"));
    expect(h.closeAuth).toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith("/dashboard/broadcaster");
  });

  it("surfaces a rejected sign in and stays put", async () => {
    h.signIn.mockResolvedValue({ ok: false, error: "Invalid email or password." });
    const user = userEvent.setup();
    await renderSettled();
    await user.selectOptions(screen.getByLabelText(/Select your use case/i), "artist");
    await user.type(screen.getByLabelText("Email"), "artist@example.com");
    await user.type(screen.getByLabelText("Password"), "wrongpass");
    await user.click(submitButton());

    expect((await screen.findByRole("alert")).textContent).toBe("Invalid email or password.");
    expect(push).not.toHaveBeenCalled();
    expect(h.closeAuth).not.toHaveBeenCalled();
  });

  it("collects an organisation name on sign up", async () => {
    h.signUp.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    setModal("signup");
    await renderSettled();
    await user.selectOptions(screen.getByLabelText(/Select your use case/i), "venue");
    await user.type(screen.getByLabelText(/Organisation or artist name/i), "Nyege Nyege");
    await user.type(screen.getByLabelText("Email"), "venue@example.com");
    await user.type(screen.getByLabelText("Password"), "secret123");
    await user.click(submitButton());
    // Consent is required: nothing is sent until the box is ticked.
    expect((await screen.findByRole("alert")).textContent).toMatch(/18 or older/);
    expect(h.signUp).not.toHaveBeenCalled();

    await user.click(screen.getByRole("checkbox", { name: /18 or older/i }));
    await user.click(submitButton());

    await waitFor(() =>
      expect(h.signUp).toHaveBeenCalledWith("venue@example.com", "secret123", "venue", "Nyege Nyege"),
    );
    expect(push).toHaveBeenCalledWith("/dashboard/venue");
  });

  it("switches to recovery and drops the role and password fields", async () => {
    const user = userEvent.setup();
    await renderSettled();
    await user.click(screen.getByRole("button", { name: /Forgot password/i }));

    expect(screen.getByRole("heading", { name: "Recover your password" })).toBeTruthy();
    expect(screen.queryByLabelText(/Select your use case/i)).toBeNull();
    expect(screen.queryByLabelText("Password")).toBeNull();
    expect(screen.queryByRole("button", { name: /^Sign Up$/ })).toBeNull();
  });

  it("sends a recovery link without needing a role", async () => {
    h.requestPasswordReset.mockResolvedValue({ ok: true, message: "Check your inbox for the link." });
    const user = userEvent.setup();
    setModal("forgot");
    await renderSettled();
    await user.type(screen.getByLabelText("Email"), "lost@example.com");
    await user.click(submitButton());

    await waitFor(() => expect(h.requestPasswordReset).toHaveBeenCalledWith("lost@example.com"));
    expect((await screen.findByRole("status")).textContent).toBe("Check your inbox for the link.");
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    render(<AuthModal />);
    await user.keyboard("{Escape}");
    expect(h.closeAuth).toHaveBeenCalled();
  });

  it("closes from the dismissal backdrop", async () => {
    const user = userEvent.setup();
    render(<AuthModal />);
    await user.click(screen.getAllByRole("button", { name: "Close" })[0]);
    expect(h.closeAuth).toHaveBeenCalled();
  });

  it("disables the submit button while a request is in flight", async () => {
    let settle: (v: { ok: boolean }) => void = () => {};
    h.signIn.mockReturnValue(new Promise((res) => (settle = res)));
    const user = userEvent.setup();
    await renderSettled();
    await user.selectOptions(screen.getByLabelText(/Select your use case/i), "cmo");
    await user.type(screen.getByLabelText("Email"), "cmo@example.com");
    await user.type(screen.getByLabelText("Password"), "secret123");
    await user.click(submitButton());

    await waitFor(() => expect(submitButton().textContent).toBe("Please wait…"));
    expect(submitButton().disabled).toBe(true);
    settle({ ok: true });
    await waitFor(() => expect(push).toHaveBeenCalledWith("/dashboard/cmo"));
  });
});
