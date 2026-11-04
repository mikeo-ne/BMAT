// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import {
  buildXlsx,
  columnLetter,
  downloadBytes,
} from "@/lib/xlsx-writer";

describe("columnLetter", () => {
  it.each([
    [0, "A"],
    [1, "B"],
    [25, "Z"],
    [26, "AA"],
    [27, "AB"],
    [51, "AZ"],
    [52, "BA"],
    [701, "ZZ"],
    [702, "AAA"],
  ])("maps column %i to %s", (index, expected) => {
    expect(columnLetter(index)).toBe(expected);
  });
  it("rejects negative or fractional indexes", () => {
    expect(() => columnLetter(-1)).toThrow(RangeError);
    expect(() => columnLetter(1.5)).toThrow(RangeError);
  });
});

/** Minimal reader for stored (uncompressed) ZIP archives written by buildXlsx. */
function readStoredZip(bytes: Uint8Array): Map<string, string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const entries = new Map<string, string>();
  let offset = 0;
  while (offset < bytes.length) {
    const signature = view.getUint32(offset, true);
    if (signature === 0x04034b50) {
      // Local file header — read one entry and continue.
    } else if (signature === 0x02014b50 || signature === 0x06054b50) {
      break; // Central directory or end-of-central-directory record.
    } else {
      throw new Error(`Missing local file header at ${offset}`);
    }
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const name = new TextDecoder().decode(
      bytes.subarray(offset + 30, offset + 30 + nameLength),
    );
    const dataStart = offset + 30 + nameLength + extraLength;
    // Compressed size sits at offset + 18 (local header) and equals the data length.
    const dataLength = view.getUint32(offset + 18, true);
    entries.set(
      name,
      new TextDecoder().decode(bytes.subarray(dataStart, dataStart + dataLength)),
    );
    offset = dataStart + dataLength;
  }
  return entries;
}

describe("buildXlsx", () => {
  it("produces a stored ZIP with the required workbook parts", () => {
    const bytes = buildXlsx("Cue sheet", [
      ["Header", "Value"],
      ["Track", "Mulongo"],
      ["Number", 42],
    ]);
    expect(Array.from(bytes.slice(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);
    const entries = readStoredZip(bytes);
    expect([...entries.keys()].sort()).toEqual(
      [
        "[Content_Types].xml",
        "_rels/.rels",
        "xl/_rels/workbook.xml.rels",
        "xl/styles.xml",
        "xl/workbook.xml",
        "xl/worksheets/sheet1.xml",
      ].sort(),
    );
    const contentTypes = entries.get("[Content_Types].xml")!;
    expect(contentTypes).toContain(
      "spreadsheetml.sheet.main+xml",
    );
    expect(entries.get("_rels/.rels")!).toContain("xl/workbook.xml");
    expect(entries.get("xl/workbook.xml")!).toContain('name="Cue sheet"');
    const sheet = entries.get("xl/worksheets/sheet1.xml")!;
    expect(sheet).toContain("<row r=\"1\">");
    expect(sheet).toContain("inlineStr");
    expect(sheet).toContain("Mulongo");
    expect(sheet).toContain("<c r=\"A2\" t=\"inlineStr\">");
    expect(sheet).toContain("<c r=\"B3\"><v>42</v></c>");
  });

  it("XML-escapes untrusted cell text", () => {
    const bytes = buildXlsx("Sheet", [
      ["<script> & \"quotes\""],
    ]);
    const sheet = readStoredZip(bytes).get("xl/worksheets/sheet1.xml")!;
    expect(sheet).not.toContain("<script>");
    expect(sheet).toContain("&lt;script&gt; &amp; &quot;quotes&quot;");
  });

  it("sanitises unsafe sheet names", () => {
    const bytes = buildXlsx("Bad [Name]: *?", [["x"]]);
    const workbook = readStoredZip(bytes).get("xl/workbook.xml")!;
    expect(workbook).not.toContain("Bad [Name]: *?");
    expect(workbook).toContain('name="Bad _Name__ __"');
  });

  it("skips empty and non-finite cells without corrupting the row", () => {
    const bytes = buildXlsx("Sheet", [
      ["a", null, "b"],
      ["c", undefined, Number.NaN],
    ]);
    const sheet = readStoredZip(bytes).get("xl/worksheets/sheet1.xml")!;
    expect(sheet).toContain('<c r="A1" t="inlineStr">');
    expect(sheet).toContain('<c r="C1" t="inlineStr">');
    expect(sheet).toContain('<c r="A2" t="inlineStr">');
    expect(sheet).not.toContain("<v>NaN</v>");
    expect(sheet).not.toContain('r="B1"');
  });
});

describe("downloadBytes", () => {
  it("creates a temporary object URL and removes the anchor", () => {
    const createObjectURL = vi.fn(() => "blob:mock");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL,
      revokeObjectURL,
    });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(
      () => {},
    );
    const append = vi
      .spyOn(document.body, "appendChild")
      .mockImplementation(() => ({} as Node));
    const remove = vi.spyOn(HTMLAnchorElement.prototype, "remove");
    downloadBytes("report.xlsx", new Uint8Array([1, 2, 3]), "application/octet-stream");
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    expect(append).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
    click.mockRestore();
    append.mockRestore();
    remove.mockRestore();
  });
});
