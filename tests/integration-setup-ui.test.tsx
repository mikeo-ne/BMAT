// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BrowserSession } from "@/lib/auth-types";
const api = vi.hoisted(() => ({ request: vi.fn(), session: vi.fn() }));
vi.mock("@/components/auth-provider", () => ({
  useAuth: () => ({ session: api.session() }),
}));
vi.mock("@/lib/auth-client", () => ({
  authFetch: api.request,
  browserSession: api.session,
  AUTH_CHANGED: "east-sound:auth-changed",
}));
import { IntegrationSetup } from "@/components/integration-setup";
let current: BrowserSession;
const receiver = {
  id: "38bf7894-fb7b-44c9-8fe9-95130c7afade",
  label: "Label inbox",
  enabled: true,
  generation: 1,
  createdAt: "2026-11-02T07:00:00Z",
  updatedAt: "2026-11-02T07:00:00Z",
  endpointUrl:
    "https://app.example.com/api/webhooks/airplay/38bf7894-fb7b-44c9-8fe9-95130c7afade",
  secretConfigured: true,
  receipts: [],
};
const data = (available = true) => ({
  execution: {
    liveEnabled: false,
    workerEnabled: false,
    providers: { whatsapp: false, email: false, webhook: false },
    immediateDispatchReady: false,
    scheduledRetriesConfigured: true,
    missing: ["No approved notification provider is configured"],
    retrySchedule: "daily-safety-net",
  },
  storage: { available, reason: available ? "ready" : "postgres_required" },
  origin: { origin: "https://app.example.com", publicHttps: true },
  encryptionKeyConfigured: true,
  receivers: [] as unknown[],
  mockIdentity: false,
  emailSenderMode: "unconfigured",
});
beforeEach(() => {
  current = {
    user: {
      id: "artist-a",
      name: "QA",
      email: "qa@example.com",
      role: "artist",
      stationIds: [],
      mock: false,
    },
    csrfToken: "c".repeat(64),
    expiresAt: "2027-01-01T00:00:00Z",
  };
  api.request.mockReset();
  api.session.mockReset().mockImplementation(() => current);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
describe("private integration onboarding", () => {
  it("explains all three providers and disables receiver creation without inventing file-backed availability", async () => {
    api.request.mockResolvedValueOnce(Response.json(data(false)));
    render(<IntegrationSetup />);
    expect(
      await screen.findByText(/Receiver creation requires PostgreSQL/),
    ).toBeDefined();
    expect(
      screen.getByRole("heading", { name: "WhatsApp Business" }),
    ).toBeDefined();
    expect(
      screen.getByRole("heading", { name: "Email with Resend" }),
    ).toBeDefined();
    expect(
      screen.getByRole("heading", { name: "Signed webhook" }),
    ).toBeDefined();
    expect(
      (
        screen.getByRole("button", {
          name: "Create private receiver",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(screen.getByText(/Off — no real sends/)).toBeDefined();
    expect(
      screen
        .getByRole("link", { name: "Meta Cloud API setup" })
        .getAttribute("rel"),
    ).toContain("noreferrer");
  });
  it("masks the one-time key, never writes it into browser storage, and drops it on an auth-change event", async () => {
    const secret = "one-time-qa-signing-secret-" + "s".repeat(40);
    const storage = vi.spyOn(Storage.prototype, "setItem");
    api.request
      .mockResolvedValueOnce(Response.json(data()))
      .mockResolvedValueOnce(
        Response.json(
          { receiver, secret, secretShownOnce: true },
          { status: 201 },
        ),
      )
      .mockResolvedValueOnce(
        Response.json({ ...data(), receivers: [receiver] }),
      );
    render(<IntegrationSetup />);
    await screen.findByText("Private receiver storage is ready.");
    fireEvent.change(screen.getByLabelText("Receiver label"), {
      target: { value: "Label inbox" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Create private receiver" }),
    );
    await screen.findByText("Save this signing key now");
    expect(screen.queryByText(secret)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Reveal key" }));
    expect(screen.getByLabelText("Signing key value").textContent).toBe(secret);
    expect(storage).not.toHaveBeenCalled();
    act(() => window.dispatchEvent(new Event("east-sound:auth-changed")));
    expect(screen.queryByText(secret)).toBeNull();
    expect(screen.queryByLabelText("One-time receiver signing key")).toBeNull();
    const posted = JSON.parse(api.request.mock.calls[1][1].body);
    expect(posted).toEqual({ action: "create", id: "", label: "Label inbox" });
  });
  it("never reveals a late key response after the active browser account changes", async () => {
    let finish!: (value: Response) => void;
    api.request
      .mockResolvedValueOnce(Response.json(data()))
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            finish = resolve;
          }),
      );
    render(<IntegrationSetup />);
    await screen.findByText("Private receiver storage is ready.");
    fireEvent.change(screen.getByLabelText("Receiver label"), {
      target: { value: "Late response" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Create private receiver" }),
    );
    current = { ...current, user: { ...current.user!, id: "artist-b" } };
    await act(async () => {
      finish(
        Response.json(
          { receiver, secret: "must-not-appear-after-account-change" },
          { status: 201 },
        ),
      );
      await Promise.resolve();
    });
    expect(
      screen.queryByText("must-not-appear-after-account-change"),
    ).toBeNull();
    expect(screen.queryByLabelText("One-time receiver signing key")).toBeNull();
  });
  it("labels the local configuration test as no external request and warns about a restricted email sender", async () => {
    const configured = {
      ...data(),
      receivers: [receiver],
      emailSenderMode: "restricted-test",
    };
    api.request
      .mockResolvedValueOnce(Response.json(configured))
      .mockResolvedValueOnce(
        Response.json({
          transport: "in-process-verifier",
          externalRequestMade: false,
          messagesSent: 0,
        }),
      )
      .mockResolvedValueOnce(Response.json(configured));
    render(<IntegrationSetup />);
    await screen.findByText("Label inbox");
    expect(screen.getByText(/Restricted Resend test sender:/)).toBeDefined();
    fireEvent.click(
      screen.getByRole("button", { name: "Run local verifier test" }),
    );
    expect(
      await screen.findByText(
        /Local verifier\/storage test passed\. No external request/,
      ),
    ).toBeDefined();
  });
});
