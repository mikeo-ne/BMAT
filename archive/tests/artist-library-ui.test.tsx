// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  ArtistLibrary,
  ArtistSpotlight,
  selectLibraryArtist,
} from "@/components/artist-library";
import { MUSIC_SOURCES, REFERENCE_RECORDINGS } from "@/lib/artist-library";

const downloadCsv = vi.fn();
vi.mock("@/lib/csv", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/csv")>()),
  downloadCsv: (...args: unknown[]) => downloadCsv(...args),
}));
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
});
beforeEach(() => {
  window.history.replaceState(null, "", "/dashboard/artists");
  downloadCsv.mockClear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("public artist music library", () => {
  it("renders the requested artist identities and all unique source-linked tracks", () => {
    render(<ArtistLibrary onDeliver={() => {}} />);
    for (const name of ["BARANGA", "MR FALLBACK", "SOUNDLYKBB", "TAI DAI"])
      expect(
        screen.getByRole("button", { name: `Show ${name} releases` }),
      ).toBeTruthy();
    expect(screen.getAllByRole("article")).toHaveLength(12);
    expect(
      screen
        .getByRole("link", { name: "Release source for SALO" })
        .getAttribute("href"),
    ).toBe(MUSIC_SOURCES.salo.url);
    expect(screen.getByText(/No master licence/)).toBeTruthy();
  });
  it("filters a featured collaborator and gives the profile traceable sources", () => {
    render(<ArtistLibrary onDeliver={() => {}} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Show MR FALLBACK releases" }),
    );
    expect(window.location.hash).toBe("#mr-fallback");
    expect(screen.getAllByRole("article")).toHaveLength(4);
    expect(
      screen.getByRole("article", {
        name: "Music reference: BREATHE (feat. MR FALLBACK)",
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole("region", { name: "About MR FALLBACK" }),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "Artist profile on Apple Music" })
        .getAttribute("href"),
    ).toBe(MUSIC_SOURCES["fallback-profile"].url);
  });
  it("supports direct hash links and resets a selected artist", () => {
    window.history.replaceState(null, "", "/dashboard/artists#tai-dai");
    render(<ArtistLibrary onDeliver={() => {}} />);
    expect(screen.getByRole("region", { name: "About TAI DAI" })).toBeTruthy();
    expect(screen.getAllByRole("article")).toHaveLength(4);
    fireEvent.click(screen.getByRole("button", { name: "All artists" }));
    expect(screen.getAllByRole("article")).toHaveLength(12);
  });
  it("searches all credited collaborators and keeps their joint credits", () => {
    render(<ArtistLibrary onDeliver={() => {}} />);
    fireEvent.change(
      screen.getByLabelText("Search artists, tracks or collaborators"),
      { target: { value: "Lukorito" } },
    );
    const card = screen.getByRole("article");
    expect(within(card).getByRole("heading", { name: "GRANTED" })).toBeTruthy();
    expect(within(card).getByText("Tai Dai · Lukorito")).toBeTruthy();
    expect(within(card).getByText("Joint artist credits")).toBeTruthy();
  });
  it("has an empty state and a working reset", () => {
    render(<ArtistLibrary onDeliver={() => {}} />);
    fireEvent.change(
      screen.getByLabelText("Search artists, tracks or collaborators"),
      { target: { value: "nothing-here" } },
    );
    expect(screen.queryByRole("article")).toBeNull();
    expect(
      screen
        .getByRole("button", { name: "Export metadata CSV" })
        .hasAttribute("disabled"),
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Show all music" }));
    expect(screen.getAllByRole("article")).toHaveLength(12);
  });
  it("exports only the current scope with sources, not music files", () => {
    render(<ArtistLibrary onDeliver={() => {}} />);
    fireEvent.change(
      screen.getByLabelText("Search artists, tracks or collaborators"),
      { target: { value: "SALO" } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Export metadata CSV" }),
    );
    expect(downloadCsv).toHaveBeenCalledOnce();
    expect(downloadCsv.mock.calls[0][1]).toContain("SALO,Baranga");
    expect(downloadCsv.mock.calls[0][1]).not.toContain("OLA MUMMY");
    expect(screen.getByText(/No audio files included/)).toBeTruthy();
  });
  it("does not contact a third-party player until the listener requests it", () => {
    const { container } = render(<ArtistLibrary onDeliver={() => {}} />);
    expect(container.querySelector("iframe")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Listen to SALO" }));
    const dialog = screen.getByRole("dialog", { name: "Listen: SALO" });
    expect(document.querySelector("iframe")).toBeNull();
    expect(
      within(dialog).getByText(/not a captured station spin/),
    ).toBeTruthy();
    const fallback = within(dialog).getByRole("link", {
      name: "Open in Apple Music instead",
    });
    expect(fallback.getAttribute("href")).toBe(
      REFERENCE_RECORDINGS[0].appleMusicUrl,
    );
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Load Apple Music player" }),
    );
    const frame = screen.getByTitle(
      "Apple Music player for SALO",
    ) as HTMLIFrameElement;
    expect(frame.src).toBe(
      "https://embed.music.apple.com/ug/album/salo/1764794748?i=1764795019&theme=light",
    );
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Close Listen: SALO" }),
    );
    expect(document.querySelector("iframe")).toBeNull();
  });
  it("resets player consent for a different recording", () => {
    render(<ArtistLibrary onDeliver={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Listen to SALO" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Load Apple Music player" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Close Listen: SALO" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Listen to Outside Shoes" }),
    );
    expect(document.querySelector("iframe")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Load Apple Music player" }),
    ).toBeTruthy();
  });
  it("routes the user to an authorised master workflow, not an automatic public-link import", () => {
    const onDeliver = vi.fn();
    render(<ArtistLibrary onDeliver={onDeliver} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Deliver an authorised master" }),
    );
    expect(onDeliver).toHaveBeenCalledOnce();
  });
  it("keeps overview-to-library selections reloadable without losing a static base path", () => {
    window.history.replaceState(
      null,
      "",
      "/BMAT/dashboard/artist/?from=overview",
    );
    selectLibraryArtist("baranga");
    expect(window.location.pathname).toBe("/BMAT/dashboard/artists/");
    expect(window.location.search).toBe("?from=overview");
    expect(window.location.hash).toBe("#baranga");
  });
  it("updates the artist filter after a browser fragment navigation", () => {
    render(<ArtistLibrary onDeliver={() => {}} />);
    act(() => {
      window.history.replaceState(null, "", "/dashboard/artists#baranga");
      window.dispatchEvent(new Event("hashchange"));
    });
    expect(screen.getAllByRole("article")).toHaveLength(3);
  });
  it("connects the overview spotlight to each requested artist", () => {
    const onSelect = vi.fn();
    render(<ArtistSpotlight onSelect={onSelect} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Explore SOUNDLYKBB music" }),
    );
    expect(onSelect).toHaveBeenCalledWith("soundlykbb");
  });
});

describe("nested artist-library URLs", () => {
  it.each(["", "/catalogue", "/delivery"])(
    "preserves a static base path, query and trailing slash from artist%s",
    (suffix) => {
      window.history.replaceState(
        null,
        "",
        `/BMAT/dashboard/artist${suffix}/?from=workspace`,
      );
      selectLibraryArtist("baranga");
      expect(
        window.location.pathname +
          window.location.search +
          window.location.hash,
      ).toBe("/BMAT/dashboard/artists/?from=workspace#baranga");
    },
  );
});
