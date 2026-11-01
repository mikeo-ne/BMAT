// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ArtistPortal } from "@/components/artist-portal";
import { buildSeedTracks } from "@/lib/catalog";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe("read-only deployment delivery presentation", () => {
  it("explains local-only staging and disables tag allocation and submission without making network requests", () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    render(
      <ArtistPortal
        initialTracks={buildSeedTracks()}
        panelSize={60}
        initialView="delivery"
        deliveryAvailable={false}
        now="2026-11-01T18:00:00.000Z"
      />,
    );
    expect(
      screen.getByText(/No file will be uploaded or reported saved/)
        .textContent,
    ).toContain("No file will be uploaded or reported saved");
    const generate = screen.getByRole("button", {
      name: "Generate ISRC",
    }) as HTMLButtonElement;
    expect(generate.disabled).toBe(true);
    fireEvent.click(generate);
    expect(
      (
        screen.getByRole("button", {
          name: "Attach audio to deliver",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
