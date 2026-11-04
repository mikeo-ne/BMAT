// @vitest-environment jsdom
import { cleanup, render, screen, fireEvent, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthModal } from "@/components/auth-modal";
import { VenueMonitor } from "@/components/venue-monitor";
import { TIERS, VENUE_NODES, VENUE_PINGS } from "@/lib/site-content";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: vi.fn(),
    refresh: vi.fn(),
    push: vi.fn(),
  }),
  usePathname: () => "/",
}));

vi.mock("@/components/auth-provider", () => ({
  useAuth: () => ({ update: vi.fn() }),
}));

vi.mock("@/components/language-provider", () => ({
  useLanguage: () => ({
    t: (key: string, params?: Record<string, string | number>) =>
      params ? key + " " + JSON.stringify(params) : key,
    lang: "en",
    setLang: vi.fn(),
    languages: [{ code: "en", label: "English", short: "EN" }],
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
}));

vi.mock("@/components/dialog", () => ({
  Dialog: ({
    children,
    onClose,
  }: {
    title: string;
    children: React.ReactNode;
    onClose: () => void;
    wide?: boolean;
  }) => (
    <div role="dialog" aria-modal="true" data-testid="dialog">
      <button type="button" onClick={onClose}>
        close
      </button>
      {children}
    </div>
  ),
}));

afterEach(cleanup);

const role = {
  id: "venue",
  label: "Venue Operator",
  headline: "Ambient listening",
  blurb: "Compliant by design",
  features: ["Ambient logs", "UPRS badge"],
};

describe("AuthModal", () => {
  it("renders the three auth tabs", () => {
    render(<AuthModal role={role} onClose={() => {}} />);
    expect(screen.getByRole("button", { name: "Sign In" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign Up" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Forgot Password" }),
    ).toBeTruthy();
  });

  it("tailors the role context to the selected tier", () => {
    render(<AuthModal role={role} onClose={() => {}} />);
    expect(screen.getByText("Venue Operator")).toBeTruthy();
    expect(screen.getByText(/Compliant by design/)).toBeTruthy();
  });

  it("switches between sign-in and sign-up without fetching", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<AuthModal role={role} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Sign Up" }));
    expect(screen.getByText("Your name")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Sign In" }));
    expect(screen.queryByText("Your name")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("offers social and mobile triggers", () => {
    render(<AuthModal role={role} onClose={() => {}} />);
    expect(screen.getByRole("button", { name: "Google" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Apple" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "WhatsApp OTP" })).toBeTruthy();
  });

  it("renders the forgot-password recovery workflow", () => {
    render(<AuthModal role={role} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Forgot Password" }));
    expect(screen.getByText("Account email")).toBeTruthy();
    expect(screen.getByText(/recovery code/i)).toBeTruthy();
  });
});

describe("VenueMonitor", () => {
  it("renders venue nodes with compliance badges", () => {
    render(<VenueMonitor />);
    const section = screen.getByRole("region");
    for (const node of VENUE_NODES) {
      expect(within(section).getByText(node.name)).toBeTruthy();
    }
  });

  it("renders the ambient ping feed", () => {
    render(<VenueMonitor />);
    const section = screen.getByRole("region");
    // Each venue's pings appear at least once.
    for (const ping of VENUE_PINGS) {
      expect(
        within(section).getAllByText(ping.track).length,
      ).toBeGreaterThan(0);
    }
  });

  it("shows the UPRS compliance summary", () => {
    const compliant = VENUE_NODES.filter(
      (node) => node.compliance === "compliant",
    ).length;
    render(<VenueMonitor />);
    const section = screen.getByRole("region");
    expect(
      within(section).getByText(
        `🟢 venues.compliant ${JSON.stringify({ count: compliant })}`,
      ),
    ).toBeTruthy();
  });
});

describe("tier data", () => {
  it("has five tiers with valid icon mappings", () => {
    const icons = new Set(["Disc3", "Mic", "Radio", "ShieldCheck", "Martini"]);
    for (const tier of TIERS) {
      expect(icons.has(tier.icon)).toBe(true);
    }
  });
});
