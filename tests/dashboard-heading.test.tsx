// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DashboardHeading } from "@/components/dashboard-heading";

const route = vi.hoisted(() => ({ pathname: "/dashboard/artist" }));
vi.mock("next/navigation", () => ({ usePathname: () => route.pathname }));
afterEach(cleanup);

const headings = [
  ["/dashboard/artist", "Artist & Label Portal"],
  ["/dashboard/playout", "Broadcaster Playout Log"],
  ["/dashboard/cmo", "CMO & UPRS Regulatory Auditor"],
  ["/dashboard/advertisers", "Advertiser Spot Tracker"],
  ["/dashboard/alerts", "Live Airplay Alerts & Webhooks"],
];

describe("workspace headings in Node and trailing-slash static exports", () => {
  it.each(
    headings.flatMap(([pathname, title]) => [
      [pathname, title],
      [`${pathname}/`, title],
    ]),
  )("renders the specific workspace at %s", (pathname, title) => {
    route.pathname = pathname;
    render(<DashboardHeading />);
    expect(screen.getByRole("heading", { name: title, level: 1 })).toBeTruthy();
  });
});
