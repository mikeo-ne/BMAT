"use client";

import { useMemo, useState } from "react";
import { loadBroadcaster, type AdLine, type BroadcasterData, type Segment, type SegmentKind } from "@/lib/db/broadcaster";
import { evidenceUrl, kampalaDate, useLoad } from "@/lib/db/core";
import { DEMO_MODE } from "@/lib/auth-context";
import { cx, safeArray } from "@/lib/safe";
import { Badge, DataTable, LoadGate, Section, StatGrid } from "@/components/dashboard/ui";
import { EvidencePlayer } from "@/components/site/EvidencePlayer";

const KIND: Record<SegmentKind, { bar: string; label: string }> = {
  music: { bar: "bg-emerald-400", label: "Music" },
  ad: { bar: "bg-amber-400", label: "Ads" },
  talk: { bar: "bg-sky-400/60", label: "Talk / other" },
};
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

function Timeline({ segments }: { segments: Segment[] }) {
  const [hover, setHover] = useState<Segment | null>(null);
  const [win, setWin] = useState<[number, number]>([360, 720]);
  const visible = safeArray(segments).filter((s) => s.end > win[0] && s.start < win[1]);
  const span = win[1] - win[0];
  const presets: { l: string; r: [number, number] }[] = [
    { l: "00–06", r: [0, 360] }, { l: "06–12", r: [360, 720] }, { l: "12–18", r: [720, 1080] }, { l: "18–24", r: [1080, 1440] }, { l: "24h", r: [0, 1440] },
  ];
  return (
    <Section id="timeline" title="Playout Timeline" actions={
      <div className="flex flex-wrap gap-2">
        {presets.map((p) => <button key={p.l} type="button" onClick={() => setWin(p.r)} className={cx("pill", win[0] === p.r[0] && win[1] === p.r[1] ? "pill-on" : "pill-off")}>{p.l}</button>)}
      </div>
    }>
      <div className="relative h-14 overflow-hidden rounded-lg bg-slate-950" onMouseLeave={() => setHover(null)}>
        {visible.map((s, i) => {
          const left = ((Math.max(s.start, win[0]) - win[0]) / span) * 100;
          const width = ((Math.min(s.end, win[1]) - Math.max(s.start, win[0])) / span) * 100;
          return (
            <button key={`${s.start}-${i}`} type="button" aria-label={`${hhmm(s.start)} ${KIND[s.kind].label}: ${s.label}`}
              onMouseEnter={() => setHover(s)} onFocus={() => setHover(s)}
              className={cx("absolute inset-y-0 border-r border-slate-950/70 opacity-80 transition hover:opacity-100", KIND[s.kind].bar)}
              style={{ left: `${left}%`, width: `${Math.max(width, 0.2)}%` }} />
          );
        })}
        {visible.length === 0 && <p className="flex h-full items-center justify-center text-xs text-slate-500">Nothing logged in this window.</p>}
      </div>
      <div className="mt-1 flex justify-between font-mono text-[10px] text-slate-500">
        <span>{hhmm(win[0])}</span><span>{hhmm(Math.round((win[0] + win[1]) / 2))}</span><span>{hhmm(win[1] === 1440 ? 1439 : win[1])}</span>
      </div>
      <div className="mt-3 flex min-h-[40px] flex-wrap items-center gap-4 text-sm">
        {(Object.keys(KIND) as SegmentKind[]).map((k) => <span key={k} className="flex items-center gap-2 text-xs text-slate-400"><span className={cx("h-2.5 w-2.5 rounded-sm", KIND[k].bar)} />{KIND[k].label}</span>)}
        {hover && <span className="ml-auto text-xs text-slate-300"><span className="font-mono text-emerald-300">{hhmm(hover.start)}–{hhmm(hover.end)}</span> · {hover.label}</span>}
      </div>
    </Section>
  );
}

function CueSheet({ data }: { data: BroadcasterData }) {
  const music = safeArray(data.segments).filter((s) => s.kind === "music");
  const [busy, setBusy] = useState<"pdf" | "xlsx" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const stationName = data.station?.name ?? "Station";
  const rows = music.map((s, i) => [String(i + 1), hhmm(s.start), `${s.end - s.start}:00`, s.label, s.composer ?? "", s.publisher ?? "", s.isrc ?? ""]);
  const header = ["#", "Time (EAT)", "Duration", "Title — Artist", "Composer", "Publisher", "ISRC"];

  const download = (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const exportPdf = async () => {
    setBusy("pdf"); setErr(null);
    try {
      const [{ jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
      const doc = new jsPDF({ orientation: "landscape" });
      doc.setFontSize(14); doc.text("UPRS Broadcast Cue Sheet", 14, 16);
      doc.setFontSize(9); doc.text(`${stationName} · ${data.date} · ${rows.length} music works`, 14, 22);
      autoTable(doc, { head: [header], body: rows, startY: 27, styles: { fontSize: 7 }, headStyles: { fillColor: [5, 150, 105] } });
      download(doc.output("blob"), `UPRS-cue-sheet-${data.date}.pdf`);
    } catch (e) { setErr(e instanceof Error ? e.message : "PDF export failed"); } finally { setBusy(null); }
  };
  const exportXlsx = async () => {
    setBusy("xlsx"); setErr(null);
    try {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      wb.creator = "East Sound Technologies";
      const ws = wb.addWorksheet("Cue Sheet");
      ws.addRow([`UPRS Broadcast Cue Sheet — ${stationName} — ${data.date}`]).font = { bold: true };
      ws.addRow([]);
      ws.addRow(header).font = { bold: true };
      rows.forEach((r) => ws.addRow(r));
      [5, 10, 10, 44, 18, 26, 18].forEach((w, i) => (ws.getColumn(i + 1).width = w));
      download(new Blob([await wb.xlsx.writeBuffer()], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `UPRS-cue-sheet-${data.date}.xlsx`);
    } catch (e) { setErr(e instanceof Error ? e.message : "Excel export failed"); } finally { setBusy(null); }
  };

  return (
    <Section id="cuesheet" title="UPRS Cue Sheet" actions={
      <div className="flex gap-2">
        <button type="button" className="btn-primary !py-2" onClick={exportPdf} disabled={busy !== null || !rows.length}>{busy === "pdf" ? "Building…" : "⬇ PDF"}</button>
        <button type="button" className="btn-ghost !py-2" onClick={exportXlsx} disabled={busy !== null || !rows.length}>{busy === "xlsx" ? "Building…" : "⬇ Excel"}</button>
      </div>
    }>
      {err && <p role="alert" className="mb-3 text-sm text-rose-300">{err}</p>}
      <DataTable rows={music.slice(0, 50)} rowKey={(s) => `${s.start}-${s.label}`} maxHeight={340} empty="No matched music on this day."
        columns={[
          { key: "play", header: "", render: (s) => <EvidencePlayer seed={s.start} size="sm" label={s.label} resolveUrl={!DEMO_MODE ? () => evidenceUrl(s.evidencePath) : undefined} /> },
          { key: "t", header: "Time", render: (s) => <span className="font-mono text-xs">{hhmm(s.start)}</span> },
          { key: "w", header: "Title — Artist", render: (s) => <span className="text-white">{s.label}</span> },
          { key: "c", header: "Composer", render: (s) => s.composer || "—" },
          { key: "p", header: "Publisher", render: (s) => s.publisher || "—" },
          { key: "i", header: "ISRC", render: (s) => <span className="font-mono text-xs">{s.isrc || "—"}</span> },
        ]} />
      {music.length > 50 && <p className="mt-2 text-xs text-slate-500">Showing 50 of {music.length}. Exports include every row.</p>}
    </Section>
  );
}

function AdControl({ ads }: { ads: AdLine[] }) {
  return (
    <Section id="adcontrol" title="Ad Control">
      <DataTable<AdLine> rows={ads} rowKey={(r) => r.id} empty="No ad bookings cover this day."
        columns={[
          { key: "adv", header: "Advertiser", render: (r) => <span className="font-medium text-white">{r.advertiser}</span> },
          { key: "spot", header: "Spot", render: (r) => r.spot },
          { key: "dp", header: "Day-part", render: (r) => <span className="font-mono text-xs">{r.daypart}</span> },
          { key: "b", header: "Booked", render: (r) => <span className="font-mono">{r.booked}</span>, className: "text-right" },
          { key: "a", header: "Aired", render: (r) => <span className="font-mono">{r.aired}</span>, className: "text-right" },
          { key: "s", header: "Result", render: (r) => {
            const d = r.aired - r.booked;
            return d === 0 ? <Badge tone="ok">Delivered</Badge> : d < 0 ? <Badge tone="bad">{-d} short · make-good due</Badge> : <Badge tone="warn">{d} extra</Badge>;
          } },
        ]} />
    </Section>
  );
}

export function BroadcasterDashboard() {
  const [date, setDate] = useState(() => kampalaDate());
  const state = useLoad(() => loadBroadcaster(date), [date]);
  return (
    <LoadGate state={state}>
      {(d) => <BroadcasterView d={d} date={date} setDate={setDate} loading={state.loading} />}
    </LoadGate>
  );
}

function BroadcasterView({ d, date, setDate, loading }: { d: BroadcasterData; date: string; setDate: (s: string) => void; loading: boolean }) {
  const totals = useMemo(() => {
    const t = { music: 0, ad: 0, talk: 0 };
    for (const s of safeArray(d.segments)) t[s.kind] += s.end - s.start;
    return t;
  }, [d.segments]);
  const all = totals.music + totals.ad + totals.talk || 1;
  const pct = (m: number) => `${Math.round((m / all) * 100)}%`;
  const short = safeArray(d.ads).filter((a) => a.aired < a.booked).length;

  if (!d.station) {
    return <div className="glass p-6 text-sm text-slate-400">No station is linked to your account yet. Ask East Sound to connect your station.</div>;
  }
  return (
    <>
      <section id="overview" className="scroll-mt-20">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-white">{d.station.name}</h1>
            <p className="text-sm text-slate-500">Kampala time</p>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-400">
            Day
            <input type="date" className="input !w-44 !py-1.5" value={date} max={kampalaDate()} onChange={(e) => e.target.value && setDate(e.target.value)} />
            {loading && <span className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-400 border-t-transparent" aria-label="Loading" />}
          </label>
        </div>
        <StatGrid items={[
          { label: "Music", value: pct(totals.music) },
          { label: "Ads", value: pct(totals.ad) },
          { label: "Talk / other", value: pct(totals.talk) },
          { label: "Ad shortfalls", value: String(short), tone: short ? "bad" : "ok" },
        ]} />
      </section>
      <Timeline segments={d.segments} />
      <CueSheet data={d} />
      <AdControl ads={d.ads} />
    </>
  );
}
