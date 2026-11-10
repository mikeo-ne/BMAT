// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The live path: the song row keeps the joined text columns (cue sheets, worker,
 * CSV exports read those) and `recording_credits` keeps one row per person.
 */
type Call = { table: string; op: string; payload?: unknown };
const h = vi.hoisted(() => ({ calls: [] as { table: string; op: string; payload?: unknown }[], creditsMissing: false }));

/** A builder that can be awaited *and* chained, the way Postgrest behaves. */
vi.mock("@/lib/db/core", async () => {
  const actual = await vi.importActual<typeof import("@/lib/db/core")>("@/lib/db/core");
  const make = (table: string): unknown => {
    const done = (value: unknown) => {
      if (h.creditsMissing && table === "recording_credits") {
        return { data: null, error: { code: "42P01", message: "no table" } };
      }
      return value;
    };
    const builder: Record<string, unknown> = {};
    builder.insert = (payload: unknown) => {
      h.calls.push({ table, op: "insert", payload });
      return builder;
    };
    builder.update = (payload: unknown) => {
      h.calls.push({ table, op: "update", payload });
      return builder;
    };
    builder.delete = () => {
      h.calls.push({ table, op: "delete" });
      return builder;
    };
    builder.select = () => builder;
    builder.eq = () => builder;
    builder.in = () => builder;
    builder.order = () => builder;
    builder.single = async () => ({ data: done({ id: "rec-1" }), error: null });
    builder.then = (onOk: (v: unknown) => unknown, onErr?: (e: unknown) => unknown) =>
      Promise.resolve(done({ data: [{ id: "rec-1" }], error: null })).then(onOk, onErr);
    return builder;
  };
  const client = { from: (table: string) => make(table) };
  return { ...actual, db: () => client, must: (r: { data?: unknown }) => r?.data };
});

const { createSong, updateSong, emptyDetails } = await import("@/lib/db/masters");
const { SongForm } = await import("@/components/dashboard/Songs");

beforeEach(() => {
  h.calls = [];
  h.creditsMissing = false;
});

afterEach(cleanup);

describe("saving to the database", () => {
  it("writes one credit row per person and the joined text columns", async () => {
    await createSong(
      { kind: "artist", userId: "user-1" },
      emptyDetails({
        title: "Masaka Groove",
        artistName: "Kato Soul",
        songwriters: ["Kato Soul", "Nalu Akello"],
        featured: ["Zawadi B"],
      }),
    );
    const song = h.calls.find((c) => c.table === "recordings" && c.op === "insert")!.payload as Record<string, string>;
    expect(song.composer).toBe("Kato Soul; Nalu Akello");
    expect(song.featuring).toBe("Zawadi B");

    const credits = h.calls.filter((c) => c.table === "recording_credits" && c.op === "insert").at(-1)!.payload as Record<string, unknown>[];
    expect(credits).toEqual([
      { recording_id: "rec-1", role: "songwriter", name: "Kato Soul", position: 0 },
      { recording_id: "rec-1", role: "songwriter", name: "Nalu Akello", position: 1 },
      { recording_id: "rec-1", role: "featured", name: "Zawadi B", position: 0 },
    ]);
  });

  it("replaces the list on edit instead of appending a second copy", async () => {
    await updateSong("rec-1", emptyDetails({ title: "Nile Fever", artistName: "Okello Prime", songwriters: ["Okello Prime", "R. Mutebi"] }));
    expect(h.calls.some((c) => c.table === "recording_credits" && c.op === "delete")).toBe(true);
    const credits = h.calls.filter((c) => c.table === "recording_credits" && c.op === "insert").at(-1)!.payload as Record<string, unknown>[];
    expect(credits.map((c) => c.name)).toEqual(["Okello Prime", "R. Mutebi"]);
  });

  it("still saves the song when the credit table has not been deployed yet", async () => {
    h.creditsMissing = true;
    await expect(createSong({ kind: "artist", userId: "user-1" }, emptyDetails({ title: "T", artistName: "A", songwriters: ["W"] }))).resolves.toBe("rec-1");
    expect(h.calls.some((c) => c.table === "recordings" && c.op === "insert")).toBe(true);
  });
});

describe("the upload form", () => {
  function Harness({ start: initial }: { start?: Partial<ReturnType<typeof emptyDetails>> }) {
    const [value, setValue] = useState(emptyDetails({ title: "Song", artistName: "Me", ...initial }));
    return <SongForm value={value} onChange={setValue} lockArtist />;
  }

  it("starts with one writer row and lets the writer add a second and a third", () => {
    render(<Harness />);
    expect(screen.getAllByLabelText(/^Songwriters \/ composers \d+$/)).toHaveLength(1);
    fireEvent.click(screen.getByText("+ Add another songwriter"));
    fireEvent.click(screen.getByText("+ Add another songwriter"));
    const rows = screen.getAllByLabelText(/^Songwriters \/ composers \d+$/) as HTMLInputElement[];
    expect(rows).toHaveLength(3);
    fireEvent.change(rows[1], { target: { value: "R. Mutebi" } });
    fireEvent.change(rows[2], { target: { value: "Nalu Akello" } });
    expect((screen.getByLabelText("Songwriters / composers 2") as HTMLInputElement).value).toBe("R. Mutebi");
    expect((screen.getByLabelText("Songwriters / composers 3") as HTMLInputElement).value).toBe("Nalu Akello");
  });

  it("lets the artist remove a row again", () => {
    render(<Harness start={{ songwriters: ["A", "B"] }} />);
    expect(screen.getAllByLabelText(/^Songwriters \/ composers \d+$/)).toHaveLength(2);
    fireEvent.click(screen.getByLabelText("Remove Songwriters / composers 1"));
    const rows = screen.getAllByLabelText(/^Songwriters \/ composers \d+$/) as HTMLInputElement[];
    expect(rows).toHaveLength(1);
    expect(rows[0].value).toBe("B");
  });

  it("has repeatable featured artists too, not one comma-separated box", () => {
    render(<Harness />);
    expect(screen.getAllByLabelText(/^Featured artists \d+$/)).toHaveLength(1);
    fireEvent.click(screen.getByText("+ Add another featured artist"));
    expect(screen.getAllByLabelText(/^Featured artists \d+$/)).toHaveLength(2);
    expect(screen.queryByText(/comma separated/i)).toBeNull();
  });
});
