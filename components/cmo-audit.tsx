"use client";

import { CapturedFeedNotice } from "@/components/captured-feed-notice";
import { useCallback, useMemo, useState } from "react";

import { PageIntro } from "@/components/page-intro";
import { ComplianceExport } from "@/components/compliance-export";
import { WeightingControls } from "@/components/weighting-controls";
import {
  DEFAULT_WEIGHTING,
  FLAT_WEIGHTING,
  type WeightingPolicy,
} from "@/lib/dayparts";
import { downloadCsv } from "@/lib/csv";
import { capturedPlayLedger } from "@/lib/compliance";
import { eatDate, type BroadcastSpin } from "@/lib/playout";
import { CmoTable } from "@/components/cmo-table";
import { DisputeAlerts } from "@/components/dispute-alerts";
import { DistributionReport } from "@/components/distribution-report";
import { ActiveFilterChips, MultiSelect } from "@/components/multi-select";
import { formatNumber, formatPeriod, lastNMonths } from "@/lib/format";
import { REGIONS } from "@/lib/regions";
import type { RightsDispute } from "@/lib/splits";
import {
  applyFilters,
  buildReport,
  countActiveFilters,
  EMPTY_FILTERS,
  ledgerToCsv,
  rateFor,
  reportToCsv,
  TARIFF,
  type PlayRow,
  type CmoFilters,
  type DistributionReport as Report,
} from "@/lib/uprs";
import { currentCapturedWindow } from "@/lib/captured-airplay";
import { useCapturedFeed } from "@/lib/use-captured-feed";
import type { Track } from "@/lib/types";

interface CmoAuditProps {
  catalogue: Track[];
  now: string;
  initialEvents?: BroadcastSpin[];
  canPoll?: boolean;
  /** Open rights disputes for the CMO to clear before paying. */
  disputes?: RightsDispute[];
}

const stamp = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");

export function CmoAudit({
  catalogue,
  now,
  disputes,
  initialEvents = [],
  canPoll = false,
}: CmoAuditProps) {
  const feed = useCapturedFeed(initialEvents, now, canPoll);
  const referenceDate = useMemo(
    () => new Date(`${eatDate(feed.now)}T12:00:00Z`),
    [feed.now],
  );

  const periods = useMemo(() => lastNMonths(6, referenceDate), [referenceDate]);

  const [filters, setFilters] = useState<CmoFilters>(EMPTY_FILTERS);
  const [report, setReport] = useState<Report | null>(null);
  const [reportRows, setReportRows] = useState<PlayRow[]>([]);
  const [weightingEnabled, setWeightingEnabled] = useState(true);
  const [policy, setPolicy] = useState<WeightingPolicy>(DEFAULT_WEIGHTING);
  const generating = false;
  const [notice, setNotice] = useState<string | null>(null);

  const effectivePolicy = weightingEnabled ? policy : FLAT_WEIGHTING;
  const ledger = useMemo(
    () =>
      capturedPlayLedger(
        feed.events.filter(
          (event) =>
            periods.includes(eatDate(event.detectedAt).slice(0, 7)) &&
            Date.parse(event.detectedAt) <= Date.parse(feed.now),
        ),
        catalogue,
        effectivePolicy,
      ),
    [feed.events, catalogue, effectivePolicy, periods, feed.now],
  );
  const members = useMemo(
    () => [
      ...new Map(
        ledger.map((row) => [
          row.memberId,
          {
            memberId: row.memberId,
            name: row.artist,
            works: new Set(
              ledger
                .filter((entry) => entry.memberId === row.memberId)
                .map((entry) => entry.isrc),
            ).size,
          },
        ]),
      ).values(),
    ],
    [ledger],
  );
  const eventLog = useMemo(
    () => currentCapturedWindow(feed.events, new Date(feed.now)),
    [feed.events, feed.now],
  );
  const filteredEvents = useMemo(
    () =>
      eventLog.filter((event) => {
        if (
          filters.stations.length &&
          !filters.stations.includes(event.stationId)
        )
          return false;
        if (filters.regions.length && !filters.regions.includes(event.region))
          return false;
        if (
          filters.periods.length &&
          !filters.periods.includes(eatDate(event.detectedAt).slice(0, 7))
        )
          return false;
        if (filters.members.length) {
          const track = catalogue.find((entry) => entry.id === event.trackId);
          if (
            !track ||
            !track.ownership?.parties.some((party) =>
              filters.members.includes(`ES-${party.id}`),
            )
          )
            return false;
        }
        return true;
      }),
    [eventLog, filters, catalogue],
  );
  const filtered = useMemo(
    () => applyFilters(ledger, filters),
    [ledger, filters],
  );

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
          count: ledger
            .filter((row) => row.period === period)
            .reduce((s, r) => s + r.plays, 0),
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
    setReport(null);
    setNotice(null);
    setFilters((prev) => ({ ...prev, [key]: next }));
  }, []);

  const chips = useMemo(() => {
    const list: { key: string; label: string }[] = [];

    for (const id of filters.stations) {
      list.push({
        key: `station:${id}`,
        label: stationOptions.find((o) => o.value === id)?.label ?? id,
      });
    }
    for (const region of filters.regions) {
      list.push({ key: `region:${region}`, label: region });
    }
    for (const period of filters.periods) {
      list.push({ key: `period:${period}`, label: formatPeriod(period) });
    }
    for (const id of filters.members) {
      list.push({
        key: `member:${id}`,
        label: memberOptions.find((o) => o.value === id)?.label ?? id,
      });
    }

    return list;
  }, [filters, stationOptions, memberOptions]);

  const removeChip = useCallback((key: string) => {
    setReport(null);
    setNotice(null);
    const [kind, ...rest] = key.split(":");
    const value = rest.join(":");

    setFilters((prev) => {
      if (kind === "station")
        return { ...prev, stations: prev.stations.filter((v) => v !== value) };
      if (kind === "region")
        return {
          ...prev,
          regions: prev.regions.filter(
            (v) => v !== value,
          ) as CmoFilters["regions"],
        };
      if (kind === "period")
        return { ...prev, periods: prev.periods.filter((v) => v !== value) };
      return { ...prev, members: prev.members.filter((v) => v !== value) };
    });
  }, []);

  const generate = useCallback(() => {
    setReport(buildReport(filtered, filters));
    setReportRows(filtered);
    setNotice(
      filtered.length === 0
        ? "Report generated over an empty selection — widen the filters."
        : `Report generated over ${formatNumber(filtered.length)} ledger rows.`,
    );
  }, [filtered, filters]);

  const exportLedger = useCallback(() => {
    downloadCsv(
      `uprs-radio-play-ledger-${stamp()}.csv`,
      ledgerToCsv(report ? reportRows : filtered),
    );
    setNotice(`Ledger CSV downloaded — ${formatNumber(filtered.length)} rows.`);
  }, [filtered, report, reportRows]);

  const exportReport = useCallback(() => {
    if (!report) return;
    downloadCsv(`uprs-distribution-report-${stamp()}.csv`, reportToCsv(report));
    setNotice("Distribution report CSV downloaded.");
  }, [report]);

  const activeCount = countActiveFilters(filters);
  const preview = useMemo(
    () => buildReport(filtered, filters, referenceDate),
    [filtered, filters, referenceDate],
  );

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-5">
      <PageIntro
        eyebrow="CMO & UPRS REGULATORY AUDITOR"
        title="Account for every play."
        description="From station logs to transparent allocations. Review rights, model your tariff, and prepare a logging sheet without the spreadsheet work."
      />
      <dl className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[
          {
            label: "Allocated play units",
            value: formatNumber(preview.totalPlays),
            hint: "Member shares, across selected months",
          },
          {
            label: "Estimated royalty pool",
            value: `UGX ${new Intl.NumberFormat("en", { notation: "compact" }).format(preview.royaltyPoolUgx)}`,
            hint: weightingEnabled
              ? "Illustrative tariffs × captured EAT dayparts"
              : "Illustrative flat-rate basis",
          },
          {
            label: "Members in scope",
            value: formatNumber(preview.memberCount),
            hint: `${preview.workCount} recordings in the ledger`,
          },
          {
            label: "Stations covered",
            value: formatNumber(preview.stationCount),
            hint: preview.periodLabel,
          },
        ].map((card) => (
          <div key={card.label} className="panel p-5">
            <dt className="text-[10px] text-muted">{card.label}</dt>
            <dd className="mt-3 text-2xl font-semibold tracking-tight tabular-nums">
              {card.value}
            </dd>
            <p className="mt-2 text-[10px] leading-relaxed text-muted">
              {card.hint}
            </p>
          </div>
        ))}
      </dl>
      <section className="panel p-4 sm:p-5" aria-labelledby="filters-heading">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2
              id="filters-heading"
              className="text-sm font-semibold tracking-tight"
            >
              Audit filters
            </h2>
            <p className="text-xs text-muted">
              {formatNumber(ledger.length)} captured rights-allocation rows
              across {new Set(ledger.map((r) => r.stationId)).size} reporting
              stations and {periodOptions.length} periods.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {activeCount > 0 && (
              <span className="chip text-brand">
                {activeCount} filter group(s) active
              </span>
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
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden
                  >
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
            label="Local rights-holder ID"
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
            onClearAll={() => {
              setFilters(EMPTY_FILTERS);
              setReport(null);
              setNotice(null);
            }}
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

      <CapturedFeedNotice unavailable={feed.unavailable} now={feed.now} />
      <WeightingControls
        policy={policy}
        enabled={weightingEnabled}
        onChange={(next) => {
          setPolicy(next);
          setReport(null);
          setNotice(null);
        }}
        onEnabled={(enabled) => {
          setWeightingEnabled(enabled);
          setReport(null);
          setNotice(null);
        }}
      />
      <p className="-mt-2 text-[10px] leading-relaxed text-muted">
        Allocations use captured EAT timestamps and supplied ISRCs with signed,
        100%-declared performance ownership. Captures without complete
        identifiers or ownership remain unallocated; local holder IDs are not
        UPRS membership verification. Rates and multipliers are illustrative,
        not official UPRS tariffs or a payment instruction.
      </p>
      <ComplianceExport
        events={filteredEvents}
        catalogue={catalogue}
        policy={effectivePolicy}
        onExport={() =>
          setNotice(
            "Recent event logging sheet downloaded. Review missing composition and programme metadata before filing.",
          )
        }
      />
      <p className="-mt-2 text-[10px] text-muted">
        Event export: current EAT day and 13 prior days, intersected with the
        station, region, period and member filters above. The monthly
        distribution ledger includes captured records in the current and five
        prior EAT calendar months; no missing months are inferred.
      </p>
      {report && (
        <DistributionReport
          report={report}
          onExportLedger={exportLedger}
          onExportReport={exportReport}
        />
      )}

      {/* Keyed on the filters so a new selection starts back on page one. */}
      <details className="rounded-xl border border-line bg-surface p-2">
        <summary className="cursor-pointer px-3 py-3 text-xs font-medium">
          Inspect detailed monthly ledger{" "}
          <span className="ml-2 text-[10px] font-normal text-muted">
            {formatNumber(filtered.length)} allocation rows
          </span>
        </summary>
        <CmoTable
          rows={filtered}
          key={JSON.stringify(filters) + JSON.stringify(effectivePolicy)}
        />
      </details>

      {disputes ? (
        <DisputeAlerts
          disputes={disputes}
          heading="Dispute resolution"
          intro="Illustrative overlapping registrations and incomplete split sheets. Review and clear claims before any payment; this demo does not enforce royalty holds."
        />
      ) : null}

      <p className="pb-2 text-center text-[11px] text-muted">
        Base placeholder rates:{" "}
        {Object.values(TARIFF)
          .map((t) => `${t.label} ${t.ugxPerPlay}`)
          .join(" · ")}{" "}
        UGX/play · tier by station reach ({rateFor(1_200_000).label} ≥ 1M,{" "}
        {rateFor(500_000).label} ≥ 400k, {rateFor(100_000).label} below).
        Placeholder tariff — see lib/uprs.ts.
      </p>
    </div>
  );
}
