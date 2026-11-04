// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PublicStatistics } from "@/components/public-statistics";
import {
  publicCaptureRecords,
  filterPublicCaptures,
  summarisePublicCaptures,
  type PublicCaptureRecord,
} from "@/lib/public-statistics";
import { CAPTURE_NOW, capturedSpin } from "@/tests/fixtures/captured";

const now = CAPTURE_NOW.toISOString();
afterEach(cleanup);
const project = (events: ReturnType<typeof capturedSpin>[]) =>
  publicCaptureRecords(events, now);
const records = () =>
  project([
    capturedSpin({ id: "recent", detectedAt: "2026-11-01T12:00:00Z" }),
    capturedSpin({ id: "older", detectedAt: "2026-10-25T20:59:59Z" }),
    capturedSpin({
      id: "west",
      stationId: "crooze-mbr",
      region: "Western",
      trackId: "ref_second",
      detectedAt: "2026-10-30T12:00:00Z",
    }),
    capturedSpin({
      id: "unknown",
      trackId: null,
      stationId: "crooze-mbr",
      region: "Western",
    }),
  ]);
function value(label: string) {
  return screen
    .getByText(label, { exact: true })
    .closest("div")
    ?.querySelector("dd")?.textContent;
}

describe("minimal, captured-only public reporting input", () => {
  it("never publishes evidence, rights, artist identity or recipient fields", () => {
    const source = capturedSpin({
      evidence: {
        url: "https://evidence.example.com/private.wav",
        sha256: "a".repeat(64),
      },
    });
    const result = project([source]);
    expect(result).toHaveLength(1);
    expect(Object.keys(result[0]).sort()).toEqual([
      "detectedAt",
      "region",
      "source",
      "stationId",
      "trackId",
    ]);
    expect(JSON.stringify(result)).not.toContain("private.wav");
    expect(result[0].source).toBe("captured");
    expect(source.evidence?.url).toContain("private.wav");
  });
  it("rejects simulations, invalid/future timestamps and records before the fourteen-day EAT boundary", () => {
    const result = project([
      capturedSpin({ id: "demo", source: "demo" }),
      capturedSpin({ id: "invalid", detectedAt: "not a date" }),
      capturedSpin({ id: "future", detectedAt: "2026-11-01T18:00:00.001Z" }),
      capturedSpin({ id: "expired", detectedAt: "2026-10-18T20:59:59.999Z" }),
      capturedSpin({ id: "boundary", detectedAt: "2026-10-18T21:00:00.000Z" }),
      capturedSpin({ id: "now", detectedAt: now }),
    ]);
    expect(result.map((row) => row.detectedAt)).toEqual([
      "2026-10-18T21:00:00.000Z",
      now,
    ]);
  });
  it("deduplicates capture IDs without mutating the source history", () => {
    const source = [
      capturedSpin(),
      capturedSpin(),
      capturedSpin({ id: "unique" }),
    ];
    expect(project(source)).toHaveLength(2);
    expect(source).toHaveLength(3);
  });
  it("uses the current EAT calendar day plus six earlier days for seven-day reports", () => {
    const input = project([
      capturedSpin({ id: "before", detectedAt: "2026-10-25T20:59:59.999Z" }),
      capturedSpin({ id: "start", detectedAt: "2026-10-25T21:00:00.000Z" }),
      capturedSpin({ id: "end", detectedAt: now }),
    ]);
    expect(filterPublicCaptures(input, now, 7)).toHaveLength(2);
    expect(filterPublicCaptures(input, now, 14)).toHaveLength(3);
  });
  it("supports all four Uganda regions without treating unknown records as matches", () => {
    const input = records();
    expect(filterPublicCaptures(input, now, 14, "Western")).toHaveLength(2);
    expect(filterPublicCaptures(input, now, 14, "Eastern")).toHaveLength(0);
    expect(summarisePublicCaptures(input)).toEqual({
      total: 4,
      stations: 2,
      recordings: 2,
      matchRate: 0.75,
    });
  });
  it("distinguishes unavailable match rate from a real zero percent", () => {
    expect(summarisePublicCaptures([]).matchRate).toBeNull();
    expect(
      summarisePublicCaptures(project([capturedSpin({ trackId: null })]))
        .matchRate,
    ).toBe(0);
  });
  it("defensively rejects invalid or non-captured client input", () => {
    const input = records()[0];
    expect(
      filterPublicCaptures(
        [
          { ...input, source: "demo" } as unknown as PublicCaptureRecord,
          { ...input, detectedAt: "invalid" },
          { ...input, detectedAt: "2026-11-02T00:00:00Z" },
        ],
        now,
        14,
      ),
    ).toEqual([]);
  });
});

describe("read-only public statistics", () => {
  it("shows honest empty reporting, not invented audience or reach values", () => {
    render(<PublicStatistics records={[]} now={now} />);
    expect(value("Captured plays")).toBe("0");
    expect(value("Reporting stations")).toBe("0");
    expect(value("Matched recordings")).toBe("0");
    expect(value("Match rate")).toBe("—");
    expect(screen.getByText(/Snapshot:/).textContent).toContain(
      "01 Nov 2026 · 21:00 EAT",
    );
    expect(screen.getByText(/Snapshot:/).textContent).toContain(
      "static exports retain their build-time snapshot",
    );
    expect(screen.getByRole("status").textContent).toContain(
      "not a claim of zero radio activity",
    );
    expect(
      screen.queryByRole("button", {
        name: /deliver|configure|subscribe|evidence/i,
      }),
    ).toBeNull();
  });
  it("updates summary, map and trend selections with reporting-window and region controls", () => {
    render(<PublicStatistics records={records()} now={now} />);
    expect(value("Captured plays")).toBe("4");
    expect(value("Match rate")).toBe("75.0%");
    fireEvent.change(screen.getByLabelText("Reporting window"), {
      target: { value: "7" },
    });
    expect(value("Captured plays")).toBe("3");
    fireEvent.change(screen.getByLabelText("Region"), {
      target: { value: "Western" },
    });
    expect(value("Captured plays")).toBe("2");
    expect(value("Match rate")).toBe("50.0%");
    expect(screen.getByRole("button", { name: "Reset map" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Reset map" }));
    expect(value("Captured plays")).toBe("3");
  });
});
