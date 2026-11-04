// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BarChart, DataTable, LineChart, LoadGate, SaveNote, StatGrid, type Column } from "@/components/dashboard/ui";

/**
 * Dashboards start life with no data: a brand-new label, a broadcaster with no
 * logs, an auditor before the first pay period. Every one of these primitives
 * has to degrade to a readable message instead of a crash or an empty box.
 */
afterEach(cleanup);

describe("DataTable", () => {
  type Row = { title: string; spins: number };
  const columns: Column<Row>[] = [
    { key: "title", header: "Title", render: (r) => r.title },
    { key: "spins", header: "Spins", render: (r) => r.spins },
  ];
  const rowsOf = (rows: Row[]) => rows;

  it("explains an empty table instead of rendering a bare header", () => {
    render(<DataTable<Row> columns={columns} rows={rowsOf([])} rowKey={(r) => String(r.title)} />);
    expect(screen.getByText("No records yet.")).toBeTruthy();
  });

  it("lets a workspace phrase its own empty state", () => {
    render(
      <DataTable<Row>
        columns={columns}
        rows={rowsOf([])}
        rowKey={(r) => String(r.title)}
        empty="No cue sheets filed for this period."
      />,
    );
    expect(screen.getByText("No cue sheets filed for this period.")).toBeTruthy();
  });

  it("renders rows when data arrives", () => {
    render(
      <DataTable
        columns={columns}
        rows={[{ title: "Kampala Nights", spins: 12 }]}
        rowKey={(r) => String(r.title)}
      />,
    );
    expect(screen.getByText("Kampala Nights")).toBeTruthy();
    expect(screen.getByText("12")).toBeTruthy();
    expect(screen.queryByText("No records yet.")).toBeNull();
  });

  it("survives null rows from a half-loaded payload", () => {
    render(<DataTable columns={columns} rows={null as never} rowKey={(r) => String(r?.title)} />);
    expect(screen.getByText("No records yet.")).toBeTruthy();
  });
});

describe("LoadGate", () => {
  const base = { data: null, error: null, loading: true, reload: () => {} };

  it("shows a loading skeleton, not content, before data lands", () => {
    render(<LoadGate state={base}>{(d: string) => <p>{d}</p>}</LoadGate>);
    expect(screen.getByLabelText("Loading")).toBeTruthy();
    expect(screen.queryByText("ready")).toBeNull();
  });

  it("offers a retry when the fetch fails", async () => {
    const reload = vi.fn();
    render(
      <LoadGate state={{ ...base, loading: false, error: "permission denied", reload }}>
        {() => <p>ready</p>}
      </LoadGate>,
    );
    expect(screen.getByRole("alert").textContent).toContain("We couldn't load your workspace.");
    expect(screen.getByText("permission denied")).toBeTruthy();
    await userEvent.setup().click(screen.getByRole("button", { name: "Try again" }));
    expect(reload).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("ready")).toBeNull();
  });

  it("renders children once data is present", () => {
    render(
      <LoadGate state={{ ...base, loading: false, data: "ready" }}>{(d: string) => <p>{d}</p>}</LoadGate>,
    );
    expect(screen.getByText("ready")).toBeTruthy();
    expect(screen.queryByLabelText("Loading")).toBeNull();
  });

  it("keeps stale data on screen when a refresh fails", () => {
    render(
      <LoadGate state={{ ...base, loading: false, data: "cached ledger", error: "network" }}>
        {(d: string) => <p>{d}</p>}
      </LoadGate>,
    );
    expect(screen.getByText("cached ledger")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("charts and stats with no data", () => {
  it("says so when a trend has fewer than two points", () => {
    render(<LineChart values={[]} label="Daily spins" />);
    expect(screen.getByText("Not enough data yet.")).toBeTruthy();
    cleanup();
    render(<LineChart values={[4]} label="Daily spins" />);
    expect(screen.getByText("Not enough data yet.")).toBeTruthy();
  });

  it("draws a trend once there are two points", () => {
    render(<LineChart values={[0, 4, 9]} label="Daily spins" />);
    expect(screen.getByRole("img", { name: "Daily spins" })).toBeTruthy();
  });

  it("renders an empty bar chart frame rather than NaN geometry", () => {
    render(<BarChart data={[]} />);
    expect(screen.getByRole("img", { name: "Bar chart" })).toBeTruthy();
  });

  it("labels each bar", () => {
    render(<BarChart data={[{ label: "Mon", value: 3 }]} />);
    expect(screen.getByText("Mon")).toBeTruthy();
  });

  it("renders a zero stat without pretending it is missing", () => {
    render(<StatGrid items={[{ label: "Total spins", value: "0" }]} />);
    expect(screen.getByText("Total spins")).toBeTruthy();
    expect(screen.getByText("0")).toBeTruthy();
  });

  it("stays silent when a save is idle", () => {
    const { container } = render(<SaveNote state={{ kind: "idle" }} />);
    expect(container.textContent).toBe("");
  });

  it("reports save progress and failure", () => {
    render(<SaveNote state={{ kind: "saving" }} />);
    expect(screen.getByRole("status").textContent).toBe("Saving…");
    cleanup();
    render(<SaveNote state={{ kind: "error" }} />);
    expect(screen.getByRole("status").textContent).toBe("Couldn't save");
  });
});
