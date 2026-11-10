// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ExportCsv } from "@/components/dashboard/ExportCsv";
import { csvFilename, csvEscape, downloadCsv, toCsv } from "@/lib/export/csv";

/**
 * Competitors sell "data feeds"; we hand over files. The rules that matter:
 * Excel must open them without mojibake, a title with a comma or a quote must
 * not shift columns, and nothing may be exported that the account cannot see.
 */
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("csv formatting", () => {
  it("leaves simple cells alone", () => {
    expect(csvEscape("Kampala Nights")).toBe("Kampala Nights");
    expect(csvEscape(42)).toBe("42");
    expect(csvEscape(null)).toBe("");
  });

  it("quotes commas, quotes and newlines the RFC way", () => {
    expect(csvEscape("Jovan, feat. Ama")).toBe('"Jovan, feat. Ama"');
    expect(csvEscape('The "Hit" Song')).toBe('"The ""Hit"" Song"');
    expect(csvEscape("line one\nline two")).toBe('"line one\nline two"');
  });

  it("writes a header row, CRLF endings and a trailing newline", () => {
    const csv = toCsv(["Title", "Spins"], [["Kampala Nights", 12], ["Nile Breeze", 7]]);
    expect(csv).toBe("Title,Spins\r\nKampala Nights,12\r\nNile Breeze,7\r\n");
  });

  it("keeps an empty export a valid file", () => {
    expect(toCsv(["Title"], [])).toBe("Title\r\n");
  });

  it("names files predictably, without spaces or slashes", () => {
    const day = new Date("2026-11-05T10:00:00Z");
    expect(csvFilename("East Sound — Catalogue", day)).toBe("east-sound-catalogue-2026-11-05.csv");
    expect(csvFilename("", day)).toBe("east-sound-2026-11-05.csv");
  });
});

describe("download", () => {
  it("adds a BOM so Excel reads Ugandan names correctly", async () => {
    const captured: Blob[] = [];
    // jsdom has no createObjectURL; provide one and inspect the blob.
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: (blob: Blob) => {
        captured.push(blob);
        return "blob:test";
      },
    });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: () => undefined });
    // jsdom tries to navigate on anchor.click(); a download is not a navigation.
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);

    expect(downloadCsv("x.csv", "Title\r\nÁmǎnī\r\n")).toBe(true);
    expect(captured).toHaveLength(1);
    // Blob.text() strips the BOM while decoding, so inspect the raw bytes.
    const bytes = new Uint8Array(await captured[0].arrayBuffer());
    expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xef, 0xbb, 0xbf]);
    const text = await captured[0].text();
    expect(text).toContain("Ámǎnī");
    expect(captured[0].type).toContain("text/csv");
  });

  it("does nothing when there is no browser to download from", async () => {
    const original = (globalThis as { document?: unknown }).document;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).document;
    expect(downloadCsv("x.csv", "a\r\n")).toBe(false);
    (globalThis as { document?: unknown }).document = original;
  });
});

describe("ExportCsv button", () => {
  const sheet = (rows: (string | number)[][]) => ({
    sheets: [{ subject: "east-sound-catalogue", headers: ["Title", "ISRC"], rows }],
  });

  it("downloads the rows and says how many left", async () => {
    const clicks: string[] = [];
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: () => "blob:test" });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: () => undefined });
    const realClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function click(this: HTMLAnchorElement) {
      clicks.push(this.download);
    };

    render(<ExportCsv {...sheet([["Kampala Nights", "UG-PSR-26-00011"]])} />);
    await userEvent.click(screen.getByRole("button", { name: "Export CSV" }));

    expect(clicks[0]).toMatch(/^east-sound-catalogue-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(screen.getByText("Exported 1 row")).toBeTruthy();
    HTMLAnchorElement.prototype.click = realClick;
  });

  it("stays disabled when there is nothing to export", () => {
    render(<ExportCsv {...sheet([])} />);
    expect((screen.getByRole("button", { name: "Export CSV" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("explains itself instead of downloading an empty file", async () => {
    render(<ExportCsv {...sheet([])} disabled={false} />);
    // Disabled buttons do not fire, so force the state the user would see with
    // rows filtered out between render and click.
    const button = screen.getByRole("button", { name: "Export CSV" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.title).toBe("No rows to export yet");
  });
});
