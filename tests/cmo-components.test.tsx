// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CmoAudit } from "@/components/cmo-audit";
import { CmoTable } from "@/components/cmo-table";
import { DistributionReport } from "@/components/distribution-report";
import { ActiveFilterChips, MultiSelect } from "@/components/multi-select";
import { buildSeedTracks } from "@/lib/catalog";
import { formatPeriod } from "@/lib/format";
import { applyFilters, buildPlayLedger, buildReport, EMPTY_FILTERS } from "@/lib/uprs";

const NOW = new Date("2026-09-03T00:00:00Z");
const CATALOGUE = buildSeedTracks(NOW);
const LEDGER = buildPlayLedger({ catalogue: CATALOGUE, now: NOW, months: 6 });

afterEach(cleanup);

describe("MultiSelect", () => {
  const options = [
    { value: "a", label: "Capital FM", hint: "Central" },
    { value: "b", label: "CBS FM", hint: "Central" },
    { value: "c", label: "Radio West", hint: "Western" },
  ];

  it("shows the all-label when nothing is selected", () => {
    render(
      <MultiSelect
        label="Station"
        options={options}
        selected={[]}
        onChange={() => {}}
        allLabel="All stations"
      />,
    );

    expect(screen.getByRole("button", { name: /All stations/ })).toBeTruthy();
  });

  it("lists its options once opened", () => {
    render(
      <MultiSelect
        label="Station"
        options={options}
        selected={[]}
        onChange={() => {}}
        allLabel="All stations"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /All stations/ }));

    expect(screen.getByRole("listbox", { name: "Station" })).toBeTruthy();
    expect(screen.getByLabelText(/Capital FM/)).toBeTruthy();
    expect(screen.getByLabelText(/Radio West/)).toBeTruthy();
  });

  it("adds a value", () => {
    const onChange = vi.fn();
    render(
      <MultiSelect label="Station" options={options} selected={[]} onChange={onChange} allLabel="All" />,
    );

    fireEvent.click(screen.getByRole("button", { name: /All/ }));
    fireEvent.click(screen.getByLabelText(/Capital FM/));

    expect(onChange).toHaveBeenLastCalledWith(["a"]);
  });

  it("removes an already-selected value", () => {
    const onChange = vi.fn();
    render(
      <MultiSelect label="Station" options={options} selected={["a"]} onChange={onChange} allLabel="All" />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Capital FM/ }));
    fireEvent.click(screen.getByLabelText(/Capital FM/));

    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it("selects all visible and clears", () => {
    const onChange = vi.fn();
    render(
      <MultiSelect label="Station" options={options} selected={[]} onChange={onChange} allLabel="All" />,
    );

    fireEvent.click(screen.getByRole("button", { name: /All/ }));
    fireEvent.click(screen.getByRole("button", { name: /Select all/ }));
    expect(onChange).toHaveBeenLastCalledWith(["a", "b", "c"]);
  });

  it("clears a populated selection", () => {
    const onChange = vi.fn();
    render(
      <MultiSelect
        label="Station"
        options={options}
        selected={["a", "b"]}
        onChange={onChange}
        allLabel="All"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /2 selected/ }));
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));

    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it("narrows the list by search", () => {
    render(
      <MultiSelect label="Station" options={options} selected={[]} onChange={() => {}} allLabel="All" />,
    );

    fireEvent.click(screen.getByRole("button", { name: /All/ }));
    fireEvent.change(screen.getByPlaceholderText(/Search station/i), { target: { value: "west" } });

    expect(screen.getByLabelText(/Radio West/)).toBeTruthy();
    expect(screen.queryByLabelText(/Capital FM/)).toBeNull();
  });

  it("closes on Escape", () => {
    render(
      <MultiSelect label="Station" options={options} selected={[]} onChange={() => {}} allLabel="All" />,
    );

    fireEvent.click(screen.getByRole("button", { name: /All/ }));
    expect(screen.getByRole("listbox", { name: "Station" })).toBeTruthy();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("listbox", { name: "Station" })).toBeNull();
  });

  it("reports how many are selected", () => {
    render(
      <MultiSelect
        label="Station"
        options={options}
        selected={["a", "b"]}
        onChange={() => {}}
        allLabel="All"
      />,
    );

    expect(screen.getByRole("button", { name: /2 selected/ })).toBeTruthy();
  });
});

describe("ActiveFilterChips", () => {
  const chips = [
    { key: "station:capital-kla", label: "Capital FM" },
    { key: "region:Central", label: "Central" },
  ];

  it("renders a removable chip per filter", () => {
    const onRemove = vi.fn();
    render(<ActiveFilterChips chips={chips} onRemove={onRemove} onClearAll={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: /Capital FM/ }));
    expect(onRemove).toHaveBeenCalledWith("station:capital-kla");
  });

  it("clears everything at once", () => {
    const onClearAll = vi.fn();
    render(<ActiveFilterChips chips={chips} onRemove={() => {}} onClearAll={onClearAll} />);

    fireEvent.click(screen.getByRole("button", { name: "Clear all" }));
    expect(onClearAll).toHaveBeenCalledTimes(1);
  });

  it("explains the unfiltered state", () => {
    render(<ActiveFilterChips chips={[]} onRemove={() => {}} onClearAll={() => {}} />);

    expect(screen.getByText(/No filters applied/)).toBeTruthy();
  });
});

describe("CmoTable", () => {
  it("paginates to 25 rows by default", () => {
    render(<CmoTable rows={LEDGER} />);

    const rows = screen.getAllByRole("row");
    // header + 25 body rows
    expect(rows).toHaveLength(26);
    expect(screen.getByText(/of\s*[\d,]+\s*rows/)).toBeTruthy();
  });

  it("pages forward", () => {
    render(<CmoTable rows={LEDGER} />);

    const next = screen.getByRole("button", { name: /Next/ });
    expect(next.hasAttribute("disabled")).toBe(false);

    fireEvent.click(next);
    expect(screen.getByText(/2 \/ \d+/)).toBeTruthy();
  });

  it("re-sorts when a header is clicked", () => {
    const earliest = [...LEDGER.map((r) => r.period)].sort()[0];

    render(<CmoTable rows={LEDGER} />);

    fireEvent.click(screen.getByRole("button", { name: /Period/ }));

    // Ascending: the first body row is the oldest reporting period.
    const firstRow = screen.getAllByRole("row")[1];
    expect(firstRow.textContent).toContain(formatPeriod(earliest));
  });

  it("explains an empty result set", () => {
    render(<CmoTable rows={[]} />);

    expect(screen.getByText("No ledger rows match these filters")).toBeTruthy();
  });
});

describe("DistributionReport", () => {
  const report = buildReport(LEDGER, EMPTY_FILTERS, NOW);

  it("shows the empty state before a report exists", () => {
    render(
      <DistributionReport
        report={buildReport([], EMPTY_FILTERS, NOW)}
        onExportLedger={() => {}}
        onExportReport={() => {}}
      />,
    );

    expect(screen.getByText("No report generated")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Export report CSV/ }).hasAttribute("disabled")).toBe(true);
  });

  it("reports total plays and the estimated pool", () => {
    render(
      <DistributionReport report={report} onExportLedger={() => {}} onExportReport={() => {}} />,
    );

    const card = screen.getByText("Total play count").closest("div")!;
    expect(within(card).getByText(report.totalPlays.toLocaleString("en-US"))).toBeTruthy();
    expect(screen.getByText("Royalty pool (est.)")).toBeTruthy();
    expect(screen.getByText(/Members payable/)).toBeTruthy();
  });

  it("shows the flat-rate basis it priced on", () => {
    render(
      <DistributionReport report={report} onExportLedger={() => {}} onExportReport={() => {}} />,
    );

    expect(screen.getByText("Royalty estimation — flat rate basis")).toBeTruthy();
    expect(screen.getByText("National FM")).toBeTruthy();
  });

  it("flags that the tariff is a placeholder", () => {
    render(
      <DistributionReport report={report} onExportLedger={() => {}} onExportReport={() => {}} />,
    );

    expect(screen.getByText(/Estimate only/)).toBeTruthy();
    expect(screen.getByText(/lib\/uprs\.ts/)).toBeTruthy();
  });

  it("fires both export actions", () => {
    const onExportLedger = vi.fn();
    const onExportReport = vi.fn();

    render(
      <DistributionReport report={report} onExportLedger={onExportLedger} onExportReport={onExportReport} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Export ledger CSV/ }));
    fireEvent.click(screen.getByRole("button", { name: /Export report CSV/ }));

    expect(onExportLedger).toHaveBeenCalledTimes(1);
    expect(onExportReport).toHaveBeenCalledTimes(1);
  });
});

describe("CmoAudit", () => {
  it("renders the four filter groups and the ledger", () => {
    render(<CmoAudit catalogue={CATALOGUE} now={NOW.toISOString()} />);

    const filters = screen.getByText("Audit filters").closest("section")!;
    for (const label of ["Station", "Region", "Date range", "Artist Membership ID"]) {
      expect(within(filters).getByText(label)).toBeTruthy();
    }

    expect(screen.getByRole("button", { name: /Generate Distribution Report/ })).toBeTruthy();
    expect(screen.getByText("Radio play ledger")).toBeTruthy();
    expect(screen.getByText(/No filters applied/)).toBeTruthy();
  });

  it("has no report until one is generated", () => {
    render(<CmoAudit catalogue={CATALOGUE} now={NOW.toISOString()} />);

    expect(screen.queryByText("Distribution report")).toBeNull();
  });

  it("generates a report over the filtered ledger", async () => {
    render(<CmoAudit catalogue={CATALOGUE} now={NOW.toISOString()} />);

    fireEvent.click(screen.getByRole("button", { name: /Generate Distribution Report/ }));

    await waitFor(() => {
      expect(screen.getByText("Distribution report")).toBeTruthy();
    });

    expect(screen.getByText("Total play count")).toBeTruthy();
    expect(screen.getByText(/Report generated over [\d,]+ ledger rows/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Export report CSV/ }).hasAttribute("disabled")).toBe(false);
  });

  it("narrows the ledger when a region filter is applied", () => {
    render(<CmoAudit catalogue={CATALOGUE} now={NOW.toISOString()} />);

    const before = screen.getByText(/aggregated member × station × period rows/).textContent ?? "";

    fireEvent.click(screen.getByRole("button", { name: /All regions/ }));
    fireEvent.click(screen.getByLabelText(/^Northern/));

    const after = screen.getByText(/aggregated member × station × period rows/).textContent ?? "";
    expect(after).not.toBe(before);

    // The chip summary reflects the selection (the select button says it too).
    const chip = screen.getByTitle("Remove this filter");
    expect(chip.textContent).toContain("Northern");

    // And the filtered set really is Northern-only.
    const filtered = applyFilters(LEDGER, { ...EMPTY_FILTERS, regions: ["Northern"] });
    expect(filtered.every((r) => r.region === "Northern")).toBe(true);
    expect(filtered.length).toBeLessThan(LEDGER.length);
  });

  it("clears all filters from the chip row", () => {
    render(<CmoAudit catalogue={CATALOGUE} now={NOW.toISOString()} />);

    fireEvent.click(screen.getByRole("button", { name: /All regions/ }));
    fireEvent.click(screen.getByLabelText(/^Northern/));
    expect(screen.queryByText(/No filters applied/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Clear all" }));
    expect(screen.getByText(/No filters applied/)).toBeTruthy();
  });
});
