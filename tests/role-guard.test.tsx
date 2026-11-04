// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/dashboard/cmo",
}));

const auth = vi.hoisted(() => ({
  session: null as { role: string } | null,
  loading: false,
}));
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ session: auth.session, loading: auth.loading }),
  DEMO_MODE: true,
}));

import { RoleGuard } from "@/components/dashboard/RoleGuard";

/**
 * Isolation layer 2. The guard is the only thing standing between a signed-in
 * artist and another role's data module, so both directions matter: it must
 * render for the right role and redirect before rendering for any other.
 */
beforeEach(() => {
  replace.mockClear();
  auth.session = null;
  auth.loading = false;
});

afterEach(cleanup);

describe("RoleGuard", () => {
  it("renders children for the matching role", () => {
    auth.session = { role: "cmo" };
    render(
      <RoleGuard role="cmo">
        <p>CMO audit ledger</p>
      </RoleGuard>,
    );
    expect(screen.getByText("CMO audit ledger")).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
  });

  it("never renders another role's children", () => {
    auth.session = { role: "artist" };
    render(
      <RoleGuard role="cmo">
        <p>CMO audit ledger</p>
      </RoleGuard>,
    );
    expect(screen.queryByText("CMO audit ledger")).toBeNull();
  });

  it("sends a mismatched role to its own dashboard", async () => {
    auth.session = { role: "label" };
    render(
      <RoleGuard role="cmo">
        <p>CMO audit ledger</p>
      </RoleGuard>,
    );
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/dashboard/label"));
  });

  it("sends a signed-out visitor to sign in", async () => {
    auth.session = null;
    render(
      <RoleGuard role="cmo">
        <p>CMO audit ledger</p>
      </RoleGuard>,
    );
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/?auth=signin"));
  });

  it("shows the securing state instead of content while loading", () => {
    auth.loading = true;
    auth.session = { role: "cmo" };
    render(
      <RoleGuard role="cmo">
        <p>CMO audit ledger</p>
      </RoleGuard>,
    );
    expect(screen.getByText(/Securing your workspace/i)).toBeTruthy();
    expect(screen.queryByText("CMO audit ledger")).toBeNull();
    expect(replace).not.toHaveBeenCalled();
  });

  it("does not redirect while the session is still resolving", () => {
    auth.loading = true;
    auth.session = null;
    render(
      <RoleGuard role="venue">
        <p>Venue nodes</p>
      </RoleGuard>,
    );
    expect(replace).not.toHaveBeenCalled();
  });

  it.each(["cmo", "label", "artist", "broadcaster", "venue"])(
    "allows %s into its own workspace",
    (role) => {
      auth.session = { role };
      render(
        <RoleGuard role={role as never}>
          <p>{role} workspace</p>
        </RoleGuard>,
      );
      expect(screen.getByText(`${role} workspace`)).toBeTruthy();
      expect(replace).not.toHaveBeenCalled();
    },
  );
});
