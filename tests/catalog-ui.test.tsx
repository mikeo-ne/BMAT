// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ lookup: vi.fn() }));
vi.mock("@/lib/db/links", async () => {
  const real = await vi.importActual<typeof import("@/lib/db/links")>("@/lib/db/links");
  return { ...real, songsFromIsrc: h.lookup };
});
const { SongUploader } = await import("@/components/dashboard/Songs");
afterEach(() => { cleanup(); h.lookup.mockReset(); });

describe("ISRC onboarding", () => {
  it("requires a choice and review, preserves manual writers/features and requires audio before saving", async () => {
    h.lookup.mockResolvedValue([{ id: "1", title: "Slow Dancing", artistName: "Azawi", artists: ["Azawi", "Guest"], isrc: "UGA2F2100082" }]);
    render(<SongUploader owner={{ kind: "artist", userId: "one" }} defaultArtist="Azawi" existing={[]} onSaved={() => {}} />);
    fireEvent.change(screen.getByLabelText("Find a song by ISRC"), { target: { value: "UG-A2F-21-00082" } });
    fireEvent.click(screen.getByText("Look up ISRC"));
    await waitFor(() => expect(screen.getByText("Review this song")).toBeTruthy());
    expect(screen.queryByText("Save song")).toBeNull();
    expect(screen.getByText(/not automatically marked as featured/)).toBeTruthy();
    fireEvent.click(screen.getByText("Review this song"));
    expect(screen.getByText(/MusicBrainz suggestion/)).toBeTruthy();
    expect((screen.getByLabelText("Featured artists 1") as HTMLInputElement).value).toBe("");
    fireEvent.click(screen.getByText("+ Add another featured artist"));
    fireEvent.click(screen.getByText("+ Add another songwriter"));
    fireEvent.change(screen.getByLabelText("Featured artists 2"), { target: { value: "Guest" } });
    fireEvent.change(screen.getByLabelText("Songwriters / composers 2"), { target: { value: "Writer" } });
    expect((screen.getByLabelText("Featured artists 2") as HTMLInputElement).value).toBe("Guest");
    expect((screen.getByLabelText("Songwriters / composers 2") as HTMLInputElement).value).toBe("Writer");
    expect((screen.getByText("Save song") as HTMLButtonElement).disabled).toBe(true);
    expect(within(screen.getByText(/Attach audio file/).closest("div")!).getByText(/Attach audio file/)).toBeTruthy();
  });
  it("leaves manual entry available when lookup is disabled", async () => {
    h.lookup.mockRejectedValue(new Error("MusicBrainz lookup isn't enabled yet."));
    render(<SongUploader owner={{ kind: "artist", userId: "one" }} existing={[]} onSaved={() => {}} />);
    fireEvent.change(screen.getByLabelText("Find a song by ISRC"), { target: { value: "UGA2F2100082" } });
    fireEvent.click(screen.getByText("Look up ISRC"));
    await waitFor(() => expect(screen.getByText(/isn't enabled yet/)).toBeTruthy());
    expect(screen.getByText(/Drop songs here/)).toBeTruthy();
  });
});
