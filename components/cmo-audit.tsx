"use client";

import { useCallback, useMemo, useState } from "react";

import { CmoTable } from "@/components/cmo-table";
import { DisputeAlerts } from "@/components/dispute-alerts";
import { DistributionReport } from "@/components/distribution-report";
import { ActiveFilterChips, MultiSelect } from "@/components/multi-select";
import { formatNumber, formatPeriod, lastNMonths } from "@/lib/format";
import { REGIONS } from "@/lib/regions";
import type { RightsDispute } from "@/lib/splits";
import {
  applyFilters,
  buildMembers,
  buildPlayLedger,
  buildReport,
  countActiveFilters,
  EMPTY_FILTERS,
  ledgerToCsv,
  rateFor,
  reportToCsv,
  TARIFF,
  type CmoFilters,
  type DistributionReport as Report,
} from "@/lib/uprs";
import type { Track } from "@/lib/types";

interface CmoAuditProps {
  catalogue: Track[];
  now: string;
  /** Open rights disputes for the CMO to clear before paying. */
  disputes?: RightsDispute[];
}

/** Triggers a browser download for a generated CSV string. */
function downloadCsv(fileName: string, csv: string): void {
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);
}

const stamp = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");

export function CmoAudit({ catalogue, now, disputes }: CmoAuditProps) {
  const referenceDate = useMemo(() => new Date(now), [now]);

  const ledger = useMemo(
    () => buildPlayLedger({ catalogue, now: referenceDate, months: 6 }),
    [catalogue, referenceDate],
  );

  const members = useMemo(() => buildMembers(catalogue), [catalogue]);
  const periods = useMemo(() => lastNMonths(6, referenceDate), [referenceDate]);

  const [filters, setFilters] = useState<CmoFilters>(EMPTY_FILTERS);
  const [report, setReport] = useState<Report | null>(null);
  const [generating, setGenerating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const filtered = useMemo(() => applyFilters(ledger, filters), [ledger, filters]);

  const stationOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of ledger) {
      counts.set(row.stationId, (counts.get(row.stationId) ?? 0) + row.plays);
    }

    const byId = new Map(ledger.map((row) => [row.stationId, row]));

    return [...byId.entries()]
      .map(([id, row]) => {
        const rate = TARIFF[row.tier];
        return {
          value: id,
          label: row.station,
          hint: `${row.region} · ${rate.label} @ ${rate.ugxPerPlay} UGX`,
          count: counts.get(id) ?? 0,
        };
      })
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [ledger]);

  const periodOptions = useMemo(
    () =>
      periods
        .filter((period) => ledger.some((row) => row.period === period))
        .map((period) => ({
          value: period,
          label: formatPeriod(period),
          hint: `Reporting month`,
          count: ledger.filter((row) => row.period === period).reduce((s, r) => s + r.plays, 0),
        }))
        .reverse(),
    [ledger, periods],
  );

  const memberOptions = useMemo(
    () =>
      members.map((member) => ({
        value: member.memberId,
        label: member.name,
        hint: `${member.works} catalogue work${member.works === 1 ? "" : "s"}`,
      })),
    [members],
  );

  const regionOptions = useMemo(
    () =>
      REGIONS.map((region) => ({
        value: region,
        label: region,
        hint: `${ledger.filter((r) => r.region === region).length} ledger rows`,
      })),
    [ledger],
  );

  const patch = useCallback((key: keyof CmoFilters, next: string[]) => {
    setFilters((prev) => ({ ...prev, [key]: next }));
  }, []);

  const chips = useMemo(() => {
    const list: { key: string; label: string }[] = [];

    for (const id of filters.stations) {
      list.push({ key: `station:${id}`, label: stationOptions.find((o) => o.value === id)?.label ?? id });
    }
    for (const region of filters.regions) {
      list.push({ key: `region:${region}`, label: region });
    }
    for (const period of filters.periods) {
      list.push({ key: `period:${period}`, label: formatPeriod(period) });
    }
    for (const id of filters.members) {
      list.push({ key: `member:${id}`, label: memberOptions.find((o) => o.value === id)?.label ?? id });
    }

    return list;
  }, [filters, stationOptions, memberOptions]);

  const removeChip = useCallback((key: string) => {
    const [kind, ...rest] = key.split(":");
    const value = rest.join(":");

    setFilters((prev) => {
      if (kind === "station") return { ...prev, stations: prev.stations.filter((v) => v !== value) };
      if (kind === "region")
        return { ...prev, regions: prev.regions.filter((v) => v !== value) as CmoFilters["regions"] };
      if (kind === "period") return { ...prev, periods: prev.periods.filter((v) => v !== value) };
      return { ...prev, members: prev.members.filter((v) => v !== value) };
    });
  }, []);

  const generate = useCallback(async () => {
    setGenerating(true);
    setNotice(null);

    // Brief pause so the action reads as a computed job rather than an instant swap.
    await new Promise<void>((resolve) => setTimeout(resolve, 350));

    setReport(buildReport(filtered, filters));
    setGenerating(false);
    setNotice(
      filtered.length === 0
        ? "Report generated over an empty selection — widen the filters."
        : `Report generated over ${formatNumber(filtered.length)} ledger rows.`,
    );
  }, [filtered, filters]);

  const exportLedger = useCallback(() => {
    downloadCsv(`uprs-radio-play-ledger-${stamp()}.csv`, ledgerToCsv(filtered));
    setNotice(`Ledger CSV downloaded — ${formatNumber(filtered.length)} rows.`);
  }, [filtered]);

  const exportReport = useCallback(() => {
    if (!report) return;
    downloadCsv(`uprs-distribution-report-${stamp()}.csv`, reportToCsv(report));
    setNotice("Distribution report CSV downloaded.");
  }, [report]);

  const activeCount = countActiveFilters(filters);

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-5">
      <section className="panel p-4 sm:p-5" aria-labelledby="filters-heading">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="filters-heading" className="text-sm font-semibold tracking-tight">
              Audit filters
            </h2>
            <p className="text-xs text-muted">
              {formatNumber(ledger.length)} aggregated UPRS ledger rows across{" "}
              {new Set(ledger.map((r) => r.stationId)).size} reporting stations and{" "}
              {periodOptions.length} periods.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {activeCount > 0 && (
              <span className="chip text-brand">{activeCount} filter group(s) active</span>
            )}
            <button
              type="button"
              className="btn btn-primary"
              onClick={generate}
              disabled={generating}
            >
              {generating ? (
                <>
                  <span className="h-3 w-3 animate-spin rounded-full border border-brand-ink/40 border-t-brand-ink" />
                  Calculating…
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path
                      d="M4 5h16M4 12h16M4 19h9"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                    />
                  </svg>
                  Generate Distribution Report
                </>
              )}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MultiSelect
            label="Station"
            options={stationOptions}
            selected={filters.stations}
            onChange={(next) => patch("stations", next)}
            allLabel="All stations"
          />
          <MultiSelect
            label="Region"
            options={regionOptions}
            selected={filters.regions}
            onChange={(next) => patch("regions", next)}
            allLabel="All regions"
            searchable={false}
          />
          <MultiSelect
            label="Date range"
            options={periodOptions}
            selected={filters.periods}
            onChange={(next) => patch("periods", next)}
            allLabel="All reporting periods"
          />
          <MultiSelect
            label="Artist Membership ID"
            options={memberOptions}
            selected={filters.members}
            onChange={(next) => patch("members", next)}
            allLabel="All members"
          />
        </div>

        <div className="mt-4 border-t border-line pt-3">
          <ActiveFilterChips
            chips={chips}
            onRemove={removeChip}
            onClearAll={() => setFilters(EMPTY_FILTERS)}
          />
        </div>

        {notice && (
          <p
            role="status"
            className="animate-rise mt-3 rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-xs text-accent"
          >
            {notice}
          </p>
        )}
      </section>

      {report && (
        <DistributionReport
          report={report}
          onExportLedger={exportLedger}
          onExportReport={exportReport}
        />
      )}

      {/* Keyed on the filters so a new selection starts back on page one. */}
      <CmoTable rows={filtered} key={JSON.stringify(filters)} />

      {disputes ? (
        <DisputeAlerts
          disputes={disputes}
          heading="Dispute resolution"
          intro="Overlapping ISRC registrations and unexecutable split sheets. Royalties on an affected recording are held until the claim is cleared."
        />
      ) : null}

      <p className="pb-2 text-center text-[11px] text-muted">
        Flat rates applied: {Object.values(TARIFF).map((t) => `${t.label} ${t.ugxPerPlay}`).join(" · ")}{" "}
        UGX/play · tier by station reach ({rateFor(1_200_000).label} ≥ 1M, {rateFor(500_000).label} ≥
        400k, {rateFor(100_000).label} below). Placeholder tariff — see lib/uprs.ts.
      </p>
    </div>
  );
}

