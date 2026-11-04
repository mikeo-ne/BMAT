// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
const request = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth-client", () => ({ authFetch: request }));
import { AccountOutboxPanel } from "@/components/account-outbox-panel";
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
describe("honest production notification readiness", () => {
  it("shows missing operator configuration instead of presenting queued simulations as live delivery", async () => {
    request.mockResolvedValueOnce(
      Response.json({
        jobs: [],
        execution: {
          liveEnabled: false,
          workerEnabled: false,
          providers: { whatsapp: false, email: false, webhook: false },
          immediateDispatchReady: false,
          scheduledRetriesConfigured: false,
          retrySchedule: "daily-safety-net",
          missing: ["No approved notification provider is configured"],
        },
      }),
    );
    render(<AccountOutboxPanel />);
    expect(
      await screen.findByText(
        "Live delivery is waiting for operator configuration",
      ),
    ).toBeDefined();
    expect(
      screen.getByText("No approved notification provider is configured"),
    ).toBeDefined();
    expect(screen.queryByText("Automatic live dispatch configured")).toBeNull();
    expect(request).toHaveBeenCalledWith("/api/notifications/outbox");
  });
});
