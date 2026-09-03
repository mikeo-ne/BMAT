// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { DetectionFeed } from "@/components/detection-feed";
import { StationCard } from "@/components/station-card";
import { StationMonitor } from "@/components/station-monitor";
import { buildSeedTracks } from "@/lib/catalog";
import {
  generateTelemetry,
  MONITORED_STATIONS,
  simulateScan,
  type Detection,
  type StationTelemetry,
} from "@/lib/monitoring";

const NOW = new Date("2026-09-03T12:00:00Z");
const CATALOGUE = buildSeedTracks(NOW);

function onlineTelemetry(overrides: Partial<StationTelemetry> = {}): StationTelemetry {
  return {
    status: "online",
    uptime: 0.995,
    latencyMs: 72,
    bufferHealth: 0.9,
    level: Array.from({ length: 24 }, (_, i) => 0.3 + (i % 7) * 0.08),
    lastHeartbeat: NOW.toISOString(),
    ...overrides,
  };
}

const DETECTIONS: Detection[] = [
  {
    id: "det_new",
    detectedAt: "2026-09-03T12:00:05.000Z",
    stationId: "capital-kla",
    stationName: "Capital FM",
    medium: "FM",
    track: { title: "Nkwagala", primaryArtist: "Ray Bwete", isrc: "UG-BMT-26-00001" },
    confidence: 0.943,
    matchedSeconds: 18,
    method: "Chromaprint v2 · spectral peak",
  },
  {
    id: "det_old",
    detectedAt: "2026-09-03T11:59:40.000Z",
    stationId: "cbs-kla",
    stationName: "CBS FM",
    medium: "FM",
    track: null,
    confidence: 0.31,
    matchedSeconds: 9,
    method: "Chromaprint v2 · spectral peak",
  },
];

beforeAll(() => {
  // jsdom ships no 2D canvas; the visualizer must degrade rather than throw.
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null as never);
});

afterEach(cleanup);

describe("StationCard", () => {
  const station = MONITORED_STATIONS[0]; // Capital FM 91.3

  it("shows identity, frequency and medium", () => {
    render(
      <StationCard
        station={station}
        telemetry={onlineTelemetry()}
        active={false}
        analyser={null}
        volume={0.12}
        onTogglePlay={() => {}}
        onVolumeChange={() => {}}
        lastDetection={undefined}
      />,
    );

    expect(screen.getByText("Capital FM")).toBeTruthy();
    expect(screen.getByText(/91\.3 MHz/)).toBeTruthy();
    expect(screen.getByText("FM")).toBeTruthy();
    expect(screen.getByText("Live")).toBeTruthy();
  });

  it("flags a degraded feed", () => {
    render(
      <StationCard
        station={station}
        telemetry={onlineTelemetry({ status: "degraded", latencyMs: 880 })}
        active={false}
        analyser={null}
        volume={0.12}
        onTogglePlay={() => {}}
        onVolumeChange={() => {}}
        lastDetection={undefined}
      />,
    );

    expect(screen.getByText("Degraded")).toBeTruthy();
    expect(screen.getByText(/880 ms/)).toBeTruthy();
  });

  it("disables the player for an offline feed", () => {
    render(
      <StationCard
        station={station}
        telemetry={onlineTelemetry({ status: "offline", latencyMs: 0 })}
        active={false}
        analyser={null}
        volume={0.12}
        onTogglePlay={() => {}}
        onVolumeChange={() => {}}
        lastDetection={undefined}
      />,
    );

    expect(screen.getByText("Offline")).toBeTruthy();
    expect(screen.getByLabelText(/Monitor Capital FM feed/).hasAttribute("disabled")).toBe(true);
  });

  it("asks the parent to play when the transport is pressed", () => {
    const onTogglePlay = vi.fn();

    render(
      <StationCard
        station={station}
        telemetry={onlineTelemetry()}
        active={false}
        analyser={null}
        volume={0.12}
        onTogglePlay={onTogglePlay}
        onVolumeChange={() => {}}
        lastDetection={undefined}
      />,
    );

    fireEvent.click(screen.getByLabelText(/Monitor Capital FM feed/));
    expect(onTogglePlay).toHaveBeenCalledTimes(1);
  });

  it("reports volume changes", () => {
    const onVolumeChange = vi.fn();

    render(
      <StationCard
        station={station}
        telemetry={onlineTelemetry()}
        active={false}
        analyser={null}
        volume={0.12}
        onTogglePlay={() => {}}
        onVolumeChange={onVolumeChange}
        lastDetection={undefined}
      />,
    );

    fireEvent.change(screen.getByLabelText(/Capital FM monitor volume/), {
      target: { value: "55" },
    });

    expect(onVolumeChange).toHaveBeenCalledWith(0.55);
  });

  it("shows the last detected track with its confidence", () => {
    render(
      <StationCard
        station={station}
        telemetry={onlineTelemetry()}
        active={false}
        analyser={null}
        volume={0.12}
        onTogglePlay={() => {}}
        onVolumeChange={() => {}}
        lastDetection={DETECTIONS[0]}
      />,
    );

    expect(screen.getByText("Last detected track")).toBeTruthy();
    expect(screen.getByText("Nkwagala")).toBeTruthy();
    expect(screen.getByText(/Ray Bwete/)).toBeTruthy();
    expect(screen.getByText("94.3%")).toBeTruthy();
    expect(screen.getByText("12:00:05")).toBeTruthy();
  });

  it("labels an unmatched detection instead of inventing a title", () => {
    render(
      <StationCard
        station={station}
        telemetry={onlineTelemetry()}
        active={false}
        analyser={null}
        volume={0.12}
        onTogglePlay={() => {}}
        onVolumeChange={() => {}}
        lastDetection={DETECTIONS[1]}
      />,
    );

    expect(screen.getByText("Unmatched audio — not in the catalogue")).toBeTruthy();
    expect(screen.getByText("31.0%")).toBeTruthy();
  });

  it("says so when nothing has been detected yet", () => {
    render(
      <StationCard
        station={station}
        telemetry={onlineTelemetry()}
        active={false}
        analyser={null}
        volume={0.12}
        onTogglePlay={() => {}}
        onVolumeChange={() => {}}
        lastDetection={undefined}
      />,
    );

    expect(screen.getByText("No detection yet")).toBeTruthy();
  });
});

describe("DetectionFeed", () => {
  it("lists each detection with timestamp, station, title and confidence", () => {
    render(<DetectionFeed detections={DETECTIONS} onClear={() => {}} />);

    expect(screen.getByText("Nkwagala")).toBeTruthy();
    expect(screen.getByText(/Capital FM/)).toBeTruthy();
    expect(screen.getByText("94.3%")).toBeTruthy();
    expect(screen.getByText("Unidentified audio")).toBeTruthy();
    expect(screen.getByText(/CBS FM/)).toBeTruthy();
    expect(screen.getByText("12:00:05")).toBeTruthy();
    expect(screen.getByText("11:59:40")).toBeTruthy();
  });

  it("counts matched and unmatched", () => {
    render(<DetectionFeed detections={DETECTIONS} onClear={() => {}} />);

    expect(screen.getByRole("button", { name: /All\s*2/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Matched\s*1/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Unmatched\s*1/ })).toBeTruthy();
  });

  it("filters to unmatched detections", () => {
    render(<DetectionFeed detections={DETECTIONS} onClear={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: /Unmatched/ }));

    expect(screen.getByText("Unidentified audio")).toBeTruthy();
    expect(screen.queryByText("Nkwagala")).toBeNull();
  });

  it("asks the parent to clear", () => {
    const onClear = vi.fn();
    render(<DetectionFeed detections={DETECTIONS} onClear={onClear} />);

    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it("shows an empty state before the first scan", () => {
    render(<DetectionFeed detections={[]} onClear={() => {}} />);

    expect(screen.getByText("No detections yet")).toBeTruthy();
    expect(screen.getByText(/Run an audio fingerprint scan/i)).toBeTruthy();
  });
});

describe("StationMonitor", () => {
  it("renders a card for every monitored station", () => {
    render(<StationMonitor catalogue={CATALOGUE} />);

    for (const station of MONITORED_STATIONS) {
      expect(screen.getByText(station.name)).toBeTruthy();
    }

    expect(screen.getByRole("button", { name: /Run Audio Fingerprint Scan/ })).toBeTruthy();
    expect(screen.getByText("No scan has run this session.")).toBeTruthy();
  });

  it("adds timestamped detections to the feed when a scan runs", async () => {
    render(<StationMonitor catalogue={CATALOGUE} />);

    expect(screen.getByText("No detections yet")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Run Audio Fingerprint Scan/ }));

    // The scan walks the panel one station at a time.
    await waitFor(
      () => {
        expect(screen.queryByText("No detections yet")).toBeNull();
      },
      { timeout: 10_000 },
    );

    await waitFor(
      () => {
        expect(screen.getByRole("button", { name: /All\s*[1-9]\d*/ })).toBeTruthy();
      },
      { timeout: 10_000 },
    );

    // Every listed detection names a station from the monitored panel.
    const stationNames = MONITORED_STATIONS.map((s) => s.name);
    const listed = screen.getAllByText((_, element) =>
      element?.tagName === "P" && stationNames.includes(element.textContent?.split(" · ")[0] ?? ""),
    );
    expect(listed.length).toBeGreaterThan(0);

    // The button re-arms once the whole panel has been walked.
    await waitFor(
      () => {
        expect(screen.getByRole("button", { name: /Run Audio Fingerprint Scan/ })).toBeTruthy();
      },
      { timeout: 10_000 },
    );

    expect(
      screen.getByRole("button", { name: /Run Audio Fingerprint Scan/ }).hasAttribute("disabled"),
    ).toBe(false);
    expect(screen.getByText(/Last scan/)).toBeTruthy();
  }, 20_000);

  it("matches scanned audio against the delivered catalogue", async () => {
    render(<StationMonitor catalogue={CATALOGUE} />);

    fireEvent.click(screen.getByRole("button", { name: /Run Audio Fingerprint Scan/ }));

    await waitFor(
      () => {
        expect(screen.queryByText("No detections yet")).toBeNull();
      },
      { timeout: 10_000 },
    );

    const catalogueTitles = CATALOGUE.map((t) => t.title);
    const rendered = screen
      .getAllByText((_, element) => element?.tagName === "P")
      .map((element) => element.textContent ?? "");

    const matchedRows = rendered.filter((text) => catalogueTitles.includes(text));
    const unmatchedRows = rendered.filter((text) => text === "Unidentified audio");

    expect(matchedRows.length + unmatchedRows.length).toBeGreaterThan(0);
  }, 20_000);

  it("explains when the browser cannot play the monitor feed", async () => {
    render(<StationMonitor catalogue={CATALOGUE} />);

    // jsdom has no AudioContext, so the fallback path is the one under test.
    // Scope to buttons: the waveform canvas carries a similar aria-label.
    const playButtons = screen.getAllByRole("button", { name: /^Monitor .* feed$/ });
    expect(playButtons.length).toBe(MONITORED_STATIONS.length);

    fireEvent.click(playButtons[0]);

    await waitFor(
      () => {
        expect(screen.getByText(/cannot be previewed|blocked the monitor feed/i)).toBeTruthy();
      },
      { timeout: 4_000 },
    );
  });
});

describe("scan/telemetry integration", () => {
  it("produces detections the feed component can render", () => {
    const telemetry = Object.fromEntries(
      MONITORED_STATIONS.map((s) => [s.id, generateTelemetry(s.id, NOW)]),
    );

    const detections = simulateScan({
      stations: MONITORED_STATIONS,
      catalogue: CATALOGUE,
      telemetry,
      now: NOW,
      seed: "integration",
    });

    const { container } = render(<DetectionFeed detections={detections} onClear={() => {}} />);

    expect(container.querySelectorAll("li").length).toBe(detections.length);
  });
});
