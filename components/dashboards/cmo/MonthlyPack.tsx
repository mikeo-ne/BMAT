"use client";

import { useEffect, useMemo, useState } from "react";

import { loadMonthlyPack } from "@/lib/db/cmo";
import { useLoad } from "@/lib/db/core";
import {
  evidenceShare,
  monthRange,
  packFilename,
  recentMonths,
  stationCsvRows,
  STATION_HEADERS,
  workCsvRows,
  WORK_HEADERS,
  type MonthlyPack as Pack,
} from "@/lib/cmo-report";
import { csvFilename, downloadCsv, toCsv } from "@/lib/export/csv";
import { fmtInt } from "@/lib/safe";
import { DataTable, Section, StatGrid } from "@/components/dashboard/ui";
import { ExportCsv } from "@/components/dashboard/ExportCsv";

/**
 * The CMO distribution pack.
 *
 * UPRS distributes per station, per month. This section produces the document
 * they file (PDF), the spreadsheet their accountants use (CSV) and points at
 * the read-only feed their systems can import — all from the same rows, so the
 * three can never disagree.
 */
function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function MonthlyPack() {
  const [month, setMonth] = useState(() => recentMonths(1)[0]);
  const state = useLoad<Pack | null>(() => loadMonthlyPack(month), [month]);
  const [busy, setBusy] = useState<"pdf" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const months = useMemo(() => recentMonths(6), []);
  const pack = state.data;
  const share = pack ? evidenceShare(pack) : 0;
  const empty = !pack || pack.stations.length === 0;

  useEffect(() => setErr(null), [month]);

  const exportPdf = async () => {
    if (!pack) return;
    setBusy("pdf");
    setErr(null);
    try {
      const [{ jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
      const doc = new jsPDF({ orientation: "landscape" });
      const range = monthRange(pack.month);

      doc.setFontSize(15);
      doc.text("East Sound — CMO Monthly Distribution Pack", 14, 16);
      doc.setFontSize(9);
      doc.text(
        `${pack.label} · ${range.from} to ${range.to} · ${fmtInt(pack.totals.spins)} plays · ${fmtInt(pack.totals.stations)} stations · ${share}% with a 10-second clip`,
        14,
        22,
      );
      if (!pack.live) doc.text("SAMPLE DATA — not a production report.", 14, 27);

      autoTable(doc, {
        head: [["Station", "Region", "Plays", "Works", "Artists", "With evidence"]],
        body: pack.stations.map((s) => [s.station, s.region, fmtInt(s.spins), fmtInt(s.works), fmtInt(s.artists), fmtInt(s.withEvidence)]),
        startY: pack.live ? 28 : 33,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [5, 150, 105] },
        didDrawPage: () => {
          doc.setFontSize(8);
          doc.text(
            `Generated ${new Date().toISOString().slice(0, 10)} · Rows reflect only what the signed-in account may read.`,
            14,
            doc.internal.pageSize.getHeight() - 8,
          );
        },
      });

      if (pack.topWorks.length) {
        const afterStations = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 40;
        doc.setFontSize(11);
        doc.text("Top works this month", 14, afterStations + 10);
        autoTable(doc, {
          head: [["#", "Title", "Artist", "Rights owner", "Plays", "Stations"]],
          body: pack.topWorks.map((w) => [String(w.rank), w.title, w.artist, w.owner, fmtInt(w.spins), fmtInt(w.stations)]),
          startY: afterStations + 14,
          styles: { fontSize: 8 },
          headStyles: { fillColor: [5, 150, 105] },
        });
      }

      save(doc.output("blob"), packFilename(pack.month, "pdf"));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "PDF export failed");
    } finally {
      setBusy(null);
    }
  };

  const feedPath = `/api/feed/airplay?month=${pack?.month ?? month}`;

  return (
    <Section
      id="monthly-pack"
      title="Monthly Distribution Pack"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="input !w-40 !py-1.5"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            aria-label="Report month"
          >
            {months.map((m) => (
              <option key={m} value={m}>
                {monthRange(m).label}
              </option>
            ))}
          </select>
          <ExportCsv
            label="⬇ CSV"
            disabled={empty}
            sheets={[
              {
                subject: `east-sound-station-report-${pack?.month ?? month}`,
                headers: [...STATION_HEADERS],
                rows: pack ? stationCsvRows(pack) : [],
              },
            ]}
          />
          <button type="button" className="btn-primary !py-2" onClick={exportPdf} disabled={empty || busy !== null}>
            {busy === "pdf" ? "Building…" : "⬇ PDF pack"}
          </button>
        </div>
      }
    >
      {err && <p role="alert" className="mb-3 text-sm text-rose-300">{err}</p>}

      {empty ? (
        <p className="py-6 text-center text-sm text-slate-500">
          {state.loading
            ? "Building the report…"
            : pack?.live
              ? `No plays recorded in ${pack.label}. The pack fills in as the worker matches music.`
              : "No report data for this month yet."}
        </p>
      ) : (
        <>
          <StatGrid
            items={[
              { label: "Plays", value: fmtInt(pack.totals.spins) },
              { label: "Stations reporting", value: fmtInt(pack.totals.stations) },
              { label: "Plays with a clip", value: `${share}%` },
              { label: "Works / artists", value: `${fmtInt(pack.totals.works)} / ${fmtInt(pack.totals.artists)}` },
            ]}
          />

          <DataTable
            rows={pack.stations}
            rowKey={(s) => s.stationId || s.station}
            maxHeight={320}
            empty="No stations reported this month."
            columns={[
              { key: "station", header: "Station", render: (s) => <span className="font-medium text-white">{s.station}</span> },
              { key: "region", header: "Region", render: (s) => s.region },
              { key: "spins", header: "Plays", render: (s) => <span className="font-mono text-xs">{fmtInt(s.spins)}</span> },
              { key: "works", header: "Works", render: (s) => <span className="font-mono text-xs">{fmtInt(s.works)}</span> },
              { key: "artists", header: "Artists", render: (s) => <span className="font-mono text-xs">{fmtInt(s.artists)}</span> },
              { key: "evidence", header: "With clip", render: (s) => <span className="font-mono text-xs text-emerald-300">{fmtInt(s.withEvidence)}</span> },
            ]}
          />

          {pack.topWorks.length > 0 && (
            <div className="mt-5">
              <p className="label">Top works this month</p>
              <DataTable
                rows={pack.topWorks.slice(0, 10)}
                rowKey={(w) => String(w.rank)}
                maxHeight={280}
                empty="No works matched."
                columns={[
                  { key: "rank", header: "#", render: (w) => <span className="font-mono text-xs text-slate-400">{w.rank}</span> },
                  { key: "title", header: "Title", render: (w) => <span className="font-medium text-white">{w.title}</span> },
                  { key: "artist", header: "Artist", render: (w) => w.artist },
                  { key: "owner", header: "Rights owner", render: (w) => w.owner },
                  { key: "spins", header: "Plays", render: (w) => <span className="font-mono text-xs">{fmtInt(w.spins)}</span> },
                ]}
              />
            </div>
          )}

          <div className="mt-5 rounded-xl border border-slate-800 bg-slate-900/40 p-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Read-only feed</p>
            <p className="mt-1 text-sm text-slate-400">
              Pull the same month into your own systems — <span className="font-mono text-emerald-300">{feedPath}</span>{" "}
              (<span className="font-mono">?format=csv</span> for CSV). Send your Supabase access token as a bearer token; the
              feed returns exactly the rows your account may already read.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="btn-ghost !py-1.5 text-xs"
                onClick={() => void navigator.clipboard?.writeText(`${window.location.origin}${feedPath}`)}
              >
                Copy feed URL
              </button>
            </div>
            <details className="mt-3 text-xs text-slate-400">
              <summary className="cursor-pointer text-slate-300">Fields and parameters</summary>
              <ul className="mt-2 list-disc space-y-1 pl-5 font-mono">
                <li>GET /api/feed/airplay?month=YYYY-MM&amp;format=json|csv&amp;station=NAME&amp;limit=N</li>
                <li>Authorization: Bearer &lt;supabase access token&gt;</li>
                <li>columns: detected_at, station, region, source, title, artist, isrc, confidence, duration_sec, evidence_path</li>
                <li>default limit 10,000 · max 50,000 · rows ordered oldest first</li>
              </ul>
            </details>
          </div>
        </>
      )}

      <p className="mt-3 text-xs text-slate-500">
        {pack?.live
          ? "Live numbers from the detections your account can read. The PDF, the CSV and the feed are built from the same rows."
          : "Sample data. In live mode this section reports the month you select, per station."}
      </p>
      <p className="mt-1 text-xs text-slate-600">
        CSV also available for the top works:{" "}
        <button
          type="button"
          className="underline hover:text-slate-300 disabled:no-underline disabled:opacity-50"
          disabled={!pack || pack.topWorks.length === 0}
          onClick={() => pack && downloadCsv(csvFilename(`east-sound-top-works-${pack.month}`), toCsv([...WORK_HEADERS], workCsvRows(pack)))}
        >
          download
        </button>
      </p>
    </Section>
  );
}
