"use client";
import { useMemo, useState } from "react";
import {
  CalendarClock,
  CheckCircle2,
  Download,
  FileCheck2,
  FileSpreadsheet,
  FileText,
  Info,
  Loader2,
} from "lucide-react";
import { PageIntro } from "@/components/page-intro";
import { HelpTip } from "@/components/help-tip";
import {
  CUE_SHEET_TARIFF_NOTE,
  buildCueSheet,
  cueSheetToPdf,
  cueSheetToXlsx,
  type CueSheet,
} from "@/lib/cue-sheets";
import { DEFAULT_WEIGHTING, FLAT_WEIGHTING, type WeightingPolicy } from "@/lib/dayparts";
import { formatCurrency, formatDuration, formatNumber } from "@/lib/format";
import { MONITORED_STATIONS } from "@/lib/monitoring";
import type { BroadcastSpin } from "@/lib/playout";
import { downloadBytes } from "@/lib/xlsx-writer";

const PERIODS = [7, 14, 30, 90] as const;

function stationMeta(stationId: string) {
  const monitored = MONITORED_STATIONS.find((station) => station.id === stationId);
  return {
    frequency: monitored?.frequency,
    medium: monitored?.medium,
  };
}

export function ReportalCueSheet({
  events,
  now,
  licensee,
}: {
  events: BroadcastSpin[];
  now: string;
  licensee?: string;
}) {
  const stations = useMemo(() => {
    const rows = [
      ...new Map(
        events.map((event) => [event.stationId, event.stationName]),
      ).entries(),
    ].sort((a, b) => a[1].localeCompare(b[1]));
    return rows;
  }, [events]);

  const [stationId, setStationId] = useState(() => stations[0]?.[0] ?? "");
  const [periodDays, setPeriodDays] = useState<number>(14);
  const [weighting, setWeighting] = useState<WeightingPolicy>(DEFAULT_WEIGHTING);
  const [licenseeDraft, setLicenseeDraft] = useState(licensee ?? "Station manager");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CueSheet | null>(null);

  const stationName =
    events.find((event) => event.stationId === stationId)?.stationName ?? "";
  const { frequency, medium } = stationMeta(stationId);

  const eligible = events.filter(
    (event) => event.stationId === stationId && event.source === "captured",
  );

  function periodBounds(days: number): { start: string; end: string } {
    const end = new Date(now);
    const start = new Date(end.getTime() - (days - 1) * 86_400_000);
    start.setUTCHours(0, 0, 0, 0);
    return { start: start.toISOString(), end: end.toISOString() };
  }

  async function generate() {
    setError(null);
    if (!stationId) {
      setError("Select a station to report on.");
      return;
    }
    if (!licenseeDraft.trim()) {
      setError("Enter the licensee name printed on the report.");
      return;
    }
    setBusy(true);
    try {
      const bounds = periodBounds(periodDays);
      const sheet = buildCueSheet(eligible, {
        stationId,
        stationName,
        licensee: licenseeDraft.trim(),
        frequency,
        medium,
        generatedAt: new Date(now),
        periodStart: bounds.start,
        periodEnd: bounds.end,
        policy: weighting,
      });
      if (!sheet.detail.length) {
        setError(
          "No captured playout records for this station and period. Broaden the window or check the station monitor.",
        );
        setResult(null);
        return;
      }
      const stamp = new Date(now).toISOString().slice(0, 10);
      // One click, two official formats: XLSX workbook and PDF document.
      downloadBytes(
        `east-sound-uprs-cue-sheet-${stationId}-${stamp}.xlsx`,
        cueSheetToXlsx(sheet),
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      const pdf = await cueSheetToPdf(sheet);
      downloadBytes(
        `east-sound-uprs-cue-sheet-${stationId}-${stamp}.pdf`,
        pdf,
        "application/pdf",
      );
      setResult(sheet);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? `Cue sheet generation failed: ${cause.message}`
          : "Cue sheet generation failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  const weighted = weighting === DEFAULT_WEIGHTING;

  return (
    <div className="mx-auto flex max-w-[1500px] flex-col gap-5">
      <PageIntro
        eyebrow="REPORTAL · UPRS cue sheets"
        title="One click to an official broadcast cue sheet"
        description="Generate your station's UPRS broadcast cue sheet directly from the captured playout log. The generator lists every captured spin with its EAT timestamp and daypart, weights the ledger by time of day, and exports both an XLSX workbook and a PDF document."
      />
      <section className="panel p-4 sm:p-5">
        <div className="mb-4 flex items-center gap-2">
          <FileCheck2 size={16} className="text-brand" />
          <h3 className="text-sm font-semibold">Cue sheet generator</h3>
          <HelpTip topic="reportal" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <label className="lg:col-span-2">
            <span className="label !text-[10px]">Station</span>
            <select
              aria-label="Reporting station"
              className="field !bg-surface !text-xs"
              value={stationId}
              onChange={(event) => {
                setStationId(event.target.value);
                setResult(null);
                setError(null);
              }}
            >
              {stations.length === 0 && <option value="">No stations</option>}
              {stations.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="label !text-[10px]">Reporting period</span>
            <select
              aria-label="Reporting period"
              className="field !bg-surface !text-xs"
              value={periodDays}
              onChange={(event) => {
                setPeriodDays(Number(event.target.value));
                setResult(null);
              }}
            >
              {PERIODS.map((days) => (
                <option key={days} value={days}>
                  Last {days} days
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="label !text-[10px]">Licensee / broadcaster</span>
            <input
              aria-label="Licensee name"
              className="field !bg-surface !text-xs"
              value={licenseeDraft}
              onChange={(event) => setLicenseeDraft(event.target.value)}
              placeholder="Licensee name"
            />
          </label>
          <label className="flex flex-col justify-center">
            <span className="label !text-[10px]">Daypart weighting</span>
            <select
              aria-label="Daypart weighting"
              className="field !bg-surface !text-xs"
              value={weighted ? "default" : "flat"}
              onChange={(event) => {
                setWeighting(
                  event.target.value === "default"
                    ? DEFAULT_WEIGHTING
                    : FLAT_WEIGHTING,
                );
                setResult(null);
              }}
            >
              <option value="default">Prime × 1.5 · Standard × 1 · Night × 0.8</option>
              <option value="flat">Flat × 1 across all bands</option>
            </select>
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-[10px] text-muted">
            {formatNumber(eligible.length)} captured records for this station ·{" "}
            {frequency ?? "—"} · {medium ?? "—"}
          </p>
          <button
            type="button"
            className="btn btn-primary !text-xs"
            disabled={busy || !stationId}
            onClick={() => void generate()}
          >
            {busy ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Download size={13} />
            )}
            {busy ? "Generating cue sheet…" : "Generate UPRS cue sheet (PDF + XLSX)"}
          </button>
        </div>
        {error && (
          <p role="alert" className="mt-3 text-[10px] text-red-200">
            {error}
          </p>
        )}
      </section>

      {result && <CueSheetResult sheet={result} />}

      <section className="panel p-5">
        <div className="flex items-start gap-3">
          <Info size={15} className="mt-0.5 shrink-0 text-muted" />
          <p className="text-[10px] leading-relaxed text-muted">
            Cue sheets are generated entirely from authenticated captured
            playout records for the signed-in broadcaster&rsquo;s assigned
            stations.
            Unmatched audio is listed with a blank ISRC — identifiers are never
            invented. {CUE_SHEET_TARIFF_NOTE} A cue sheet is an internal
            compliance export, not a certified UPRS filing or a payment.
          </p>
        </div>
      </section>
    </div>
  );
}

function CueSheetResult({ sheet }: { sheet: CueSheet }) {
  const { options, totals, byTrack } = sheet;
  return (
    <section
      className="panel overflow-hidden"
      aria-labelledby="cue-sheet-result-heading"
    >
      <div className="flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="flex min-w-0 items-start gap-3">
          <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-brand" />
          <div>
            <p className="eyebrow">CUE SHEET GENERATED</p>
            <h3
              id="cue-sheet-result-heading"
              className="mt-1 text-sm font-semibold"
            >
              {options.stationName} · {options.licensee}
            </h3>
            <p className="mt-1 text-[10px] text-muted">
              {options.frequency ?? options.medium ?? "Station"} · period{" "}
              {new Date(options.periodStart).toISOString().slice(0, 10)} →{" "}
              {new Date(options.periodEnd).toISOString().slice(0, 10)} · EAT
            </p>
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <span className="flex items-center gap-1.5 rounded-lg border border-line bg-surface-2/50 px-2.5 py-1 text-[10px] text-muted">
            <FileSpreadsheet size={13} />
            XLSX
          </span>
          <span className="flex items-center gap-1.5 rounded-lg border border-line bg-surface-2/50 px-2.5 py-1 text-[10px] text-muted">
            <FileText size={13} />
            PDF
          </span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 border-t border-line p-5 sm:grid-cols-4">
        {[
          ["Captured plays", formatNumber(totals.plays)],
          ["Recordings", formatNumber(totals.recordings)],
          ["Weighted plays", formatNumber(totals.weightedPlays)],
          [
            "Indicative estimate",
            `UGX ${formatCurrency(totals.indicativePoolUgx)}`,
          ],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-line bg-surface-2/30 p-3">
            <p className="text-[9px] font-semibold uppercase tracking-wider text-muted">
              {label}
            </p>
            <p className="mt-1 text-sm font-semibold">{value}</p>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 border-t border-line p-5">
        <span className="rounded-lg border border-line bg-surface-2/40 px-2.5 py-1 text-[10px] text-muted">
          Prime ×{options.policy.prime}: {totals.bandPlays.prime} plays
        </span>
        <span className="rounded-lg border border-line bg-surface-2/40 px-2.5 py-1 text-[10px] text-muted">
          Standard ×{options.policy.standard}: {totals.bandPlays.standard} plays
        </span>
        <span className="rounded-lg border border-line bg-surface-2/40 px-2.5 py-1 text-[10px] text-muted">
          Night ×{options.policy.night}: {totals.bandPlays.night} plays
        </span>
      </div>
      <div className="border-t border-line">
        <table className="w-full text-[10px]">
          <thead>
            <tr className="border-b border-line text-left text-muted">
              <th className="px-5 py-2 font-semibold">Track</th>
              <th className="px-3 py-2 font-semibold">Artist</th>
              <th className="px-3 py-2 font-semibold">ISRC</th>
              <th className="px-3 py-2 text-right font-semibold">Plays</th>
              <th className="px-3 py-2 text-right font-semibold">Weighted</th>
              <th className="px-5 py-2 text-right font-semibold">Duration</th>
            </tr>
          </thead>
          <tbody>
            {byTrack.map((row) => (
              <tr key={`${row.title}-${row.artist}-${row.isrc}`} className="border-b border-line/50">
                <td className="max-w-[260px] truncate px-5 py-2">{row.title}</td>
                <td className="px-3 py-2">{row.artist}</td>
                <td className="px-3 py-2 font-mono text-[9px]">
                  {row.isrc || "—"}
                </td>
                <td className="px-3 py-2 text-right">{row.plays}</td>
                <td className="px-3 py-2 text-right">{row.weightedPlays.toFixed(1)}</td>
                <td className="px-5 py-2 text-right text-muted">
                  {formatDuration(
                    sheet.detail.find(
                      (detail) => detail.title === row.title,
                    )?.durationSec ?? 0,
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-2 border-t border-line px-5 py-3 text-[9px] text-muted">
        <CalendarClock size={12} />
        Generated {new Date(options.generatedAt).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })} · EAT daypart bands · placeholder tariff
      </div>
    </section>
  );
}
