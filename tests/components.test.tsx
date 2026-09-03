// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { AirplayTable } from "@/components/airplay-table";
import { RegionAirplayChart } from "@/components/region-airplay-chart";
import { Sparkline } from "@/components/sparkline";
import { StatCards } from "@/components/stat-cards";
import { TrackMetadataForm, type MetadataValues } from "@/components/track-metadata-form";
import { buildSeedTracks } from "@/lib/catalog";
import { summariseCatalog } from "@/lib/types";

const NOW = new Date("2026-09-03T00:00:00Z");
const TRACKS = buildSeedTracks(NOW);

beforeAll(() => {
  // Recharts measures its container with ResizeObserver, which jsdom lacks.
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
});

// Vitest globals are off, so testing-library cannot register its own afterEach.
afterEach(cleanup);

describe("StatCards", () => {
  it("shows the panel-wide totals", () => {
    const summary = summariseCatalog(TRACKS);
    render(<StatCards summary={summary} />);

    expect(screen.getByText("Total stream spins")).toBeTruthy();
    expect(screen.getByText(summary.totalSpins.toLocaleString("en-US"))).toBeTruthy();
  });
});

describe("RegionAirplayChart", () => {
  it("renders a card for each Ugandan region with its spins and share", () => {
    const summary = summariseCatalog(TRACKS);
    render(
      <RegionAirplayChart
        tracks={TRACKS}
        summary={summary}
        focusRegion="All"
        onFocusRegion={() => {}}
      />,
    );

    for (const region of ["Central", "Eastern", "Western", "Northern"]) {
      const card = screen.getAllByText(region).at(-1)!.closest("button")!;
      expect(within(card).getByText(summary.byRegion[region as "Central"].spins.toLocaleString("en-US"))).toBeTruthy();
    }
  });

  it("tells the parent when a region card is clicked", () => {
    const onFocusRegion = vi.fn();
    const summary = summariseCatalog(TRACKS);

    render(
      <RegionAirplayChart
        tracks={TRACKS}
        summary={summary}
        focusRegion="All"
        onFocusRegion={onFocusRegion}
      />,
    );

    const western = screen.getAllByText("Western").at(-1)!.closest("button")!;
    fireEvent.click(western);

    expect(onFocusRegion).toHaveBeenCalledWith("Western");
  });

  it("shows an empty state when the catalogue is empty", () => {
    render(
      <RegionAirplayChart
        tracks={[]}
        summary={summariseCatalog([])}
        focusRegion="All"
        onFocusRegion={() => {}}
      />,
    );

    expect(
      screen.getByText(/Regional airplay appears here once your first master is delivered/i),
    ).toBeTruthy();
  });
});

describe("AirplayTable", () => {
  it("lists every track with its ISRC and spins", () => {
    render(
      <AirplayTable
        tracks={TRACKS}
        focusRegion="All"
        onFocusRegion={() => {}}
        onDelete={() => {}}
        pendingDeleteId={null}
      />,
    );

    for (const track of TRACKS) {
      expect(screen.getByText(track.title)).toBeTruthy();
      expect(screen.getByText(track.isrc)).toBeTruthy();
      expect(screen.getByText(track.totalSpins.toLocaleString("en-US"))).toBeTruthy();
    }
  });

  it("switches the spin column to the focused region", () => {
    const track = TRACKS[0];
    const northern = track.airplay.find((a) => a.region === "Northern")!.spins;

    render(
      <AirplayTable
        tracks={[track]}
        focusRegion="Northern"
        onFocusRegion={() => {}}
        onDelete={() => {}}
        pendingDeleteId={null}
      />,
    );

    // Scope to the track's own row — the footer total repeats the same number.
    const row = screen.getByText(track.title).closest("tr")!;

    expect(within(row).getByText(northern.toLocaleString("en-US"))).toBeTruthy();
    expect(within(row).queryByText(track.totalSpins.toLocaleString("en-US"))).toBeNull();
  });

  it("filters by search text", () => {
    render(
      <AirplayTable
        tracks={TRACKS}
        focusRegion="All"
        onFocusRegion={() => {}}
        onDelete={() => {}}
        pendingDeleteId={null}
      />,
    );

    fireEvent.change(screen.getByLabelText("Search the catalogue"), {
      target: { value: "Ggwe" },
    });

    expect(screen.getByText("Ggwe Ondabika")).toBeTruthy();
    expect(screen.queryByText("Nkwagala")).toBeNull();
  });

  it("asks the parent to remove a track", () => {
    const onDelete = vi.fn();
    render(
      <AirplayTable
        tracks={[TRACKS[0]]}
        focusRegion="All"
        onFocusRegion={() => {}}
        onDelete={onDelete}
        pendingDeleteId={null}
      />,
    );

    fireEvent.click(screen.getByLabelText(`Remove ${TRACKS[0].title} from the catalogue`));
    expect(onDelete).toHaveBeenCalledWith(TRACKS[0].id);
  });
});

describe("Sparkline", () => {
  it("draws a path per data point", () => {
    const { container } = render(<Sparkline values={[1, 4, 2, 8, 3]} />);
    const paths = container.querySelectorAll("path");

    expect(paths.length).toBe(2); // area + line
    expect(container.querySelector("svg")!.getAttribute("aria-label")).toMatch(/5 reporting days/);
  });
});

describe("TrackMetadataForm", () => {
  const values: MetadataValues = {
    title: "Nkwagala",
    primaryArtist: "Ray Bwete",
    featuredArtists: "Aisha Nakato",
    releaseDate: "2026-09-10",
    isrc: "UG-NNT-26-00001",
  };

  it("renders all five delivery fields", () => {
    render(
      <TrackMetadataForm
        values={values}
        errors={{}}
        onChange={() => {}}
        onGenerateIsrc={() => {}}
        generatingIsrc={false}
        staged={null}
        submitting={false}
        onSubmit={() => {}}
        onClear={() => {}}
        today="2026-09-03"
      />,
    );

    expect(screen.getByLabelText(/Song title/)).toBeTruthy();
    expect(screen.getByLabelText(/Primary artist/)).toBeTruthy();
    expect(screen.getByLabelText(/Featured artists/)).toBeTruthy();
    expect(screen.getByLabelText(/Release date/)).toBeTruthy();
    expect(screen.getByLabelText(/^ISRC/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Generate ISRC/ })).toBeTruthy();
  });

  it("blocks delivery until an audio master is attached", () => {
    const { rerender } = render(
      <TrackMetadataForm
        values={values}
        errors={{}}
        onChange={() => {}}
        onGenerateIsrc={() => {}}
        generatingIsrc={false}
        staged={null}
        submitting={false}
        onSubmit={() => {}}
        onClear={() => {}}
        today="2026-09-03"
      />,
    );

    expect(screen.getByRole("button", { name: /Attach audio to deliver/ }).hasAttribute("disabled")).toBe(true);

    rerender(
      <TrackMetadataForm
        values={values}
        errors={{}}
        onChange={() => {}}
        onGenerateIsrc={() => {}}
        generatingIsrc={false}
        staged={{
          id: "stg_1",
          file: new File(["x"], "a.mp3", { type: "audio/mpeg" }),
          fileName: "a.mp3",
          sizeBytes: 1000,
          format: "MP3",
          mimeType: "audio/mpeg",
          durationSec: 12,
          previewUrl: "blob:stub",
        }}
        submitting={false}
        onSubmit={() => {}}
        onClear={() => {}}
        today="2026-09-03"
      />,
    );

    expect(screen.getByRole("button", { name: /Deliver to catalogue/ }).hasAttribute("disabled")).toBe(false);
  });

  it("rejects an invalid ISRC before submit", () => {
    const onSubmit = vi.fn();

    render(
      <form>
        <TrackMetadataForm
          values={{ ...values, isrc: "UG-NNT-26-001" }}
          errors={{}}
          onChange={() => {}}
          onGenerateIsrc={() => {}}
          generatingIsrc={false}
          staged={null}
          submitting={false}
          onSubmit={onSubmit}
          onClear={() => {}}
          today="2026-09-03"
        />
      </form>,
    );

    act(() => {
      fireEvent.submit(screen.getByRole("button", { name: /Attach audio to deliver/ }).closest("form")!);
    });

    expect(screen.getByText(/Expected CC-XXX-YY-NNNNN/)).toBeTruthy();
  });
});

describe("AirplayTable reusability", () => {
  it("hides the remove action when no onDelete is passed", () => {
    render(<AirplayTable tracks={TRACKS} />);

    expect(screen.queryByRole("button", { name: /Remove .* from the catalogue/ })).toBeNull();
    expect(screen.getAllByRole("row").length).toBe(TRACKS.length + 2);
  });

  it("hides the region switcher when the parent does not drive focus", () => {
    render(<AirplayTable tracks={TRACKS} />);

    expect(screen.queryByRole("button", { name: "All regions" })).toBeNull();
  });

  it("still offers the region switcher when a handler is supplied", () => {
    render(<AirplayTable tracks={TRACKS} onFocusRegion={() => {}} />);

    expect(screen.getByRole("button", { name: "All regions" })).toBeTruthy();
  });

  it("accepts a custom heading", () => {
    render(<AirplayTable tracks={TRACKS} title="Kidandali chart" />);

    expect(screen.getByText("Kidandali chart")).toBeTruthy();
  });

  it("surfaces each recording's genre", () => {
    render(<AirplayTable tracks={[TRACKS[0]]} />);

    expect(screen.getByText(TRACKS[0].genre!)).toBeTruthy();
  });

  it("can turn the search box off", () => {
    render(<AirplayTable tracks={TRACKS} showSearch={false} />);

    expect(screen.queryByLabelText("Search the catalogue")).toBeNull();
  });
});
