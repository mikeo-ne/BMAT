// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { VenueDashboard } from "@/components/venue-dashboard";
import { VENUE_NODES, VENUE_PINGS } from "@/lib/site-content";

const cayenne = VENUE_NODES.find((node) => node.id === "cayenne")!;
const bikya = VENUE_NODES.find((node) => node.id === "bikya")!;
const pending = VENUE_NODES.find((node) => node.compliance === "pending")!;

afterEach(cleanup);

describe("VenueDashboard only renders the operator's own scope", () => {
  it("shows the assigned node and hides every other venue", () => {
    render(
      <VenueDashboard
        nodes={[cayenne]}
        pings={VENUE_PINGS.filter((ping) => ping.venue === cayenne.name)}
      />,
    );
    expect(screen.getAllByText(cayenne.name).length).toBeGreaterThan(0);
    expect(screen.queryByText(bikya.name)).toBeNull();
  });

  it("badges UPRS compliance for a compliant node", () => {
    render(<VenueDashboard nodes={[cayenne]} pings={[]} />);
    expect(
      screen.getAllByText(/UPRS public performance compliant/i).length,
    ).toBeGreaterThan(0);
  });

  it("shows a pending badge when a node is awaiting review", () => {
    render(<VenueDashboard nodes={[pending]} pings={[]} />);
    expect(screen.getAllByText(/pending UPRS review/i).length).toBeGreaterThan(
      0,
    );
  });

  it("survives missing data with an honest empty state", () => {
    render(
      <VenueDashboard
        nodes={undefined as unknown as typeof VENUE_NODES}
        pings={undefined as unknown as typeof VENUE_PINGS}
      />,
    );
    expect(screen.getByText(/No venue node is linked/i)).toBeTruthy();
    expect(screen.getByText(/No ambient plays recorded/i)).toBeTruthy();
  });
});
