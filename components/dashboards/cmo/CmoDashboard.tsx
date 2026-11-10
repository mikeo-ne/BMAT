"use client";

import { useMemo, useState } from "react";
import { loadCmo, resolveDispute, resolveUnmatched, type CmoData, type Dispute, type DisputeStatus, type UnmatchedClip, type Work } from "@/lib/db/cmo";
import { evidenceUrl, fmtTime } from "@/lib/db/core";
import { Freshness, useLiveLoad } from "@/lib/db/live";
import { cx, fmtInt, fmtUGX, safeArray } from "@/lib/safe";
import { allocatePool, sanitizeShare, splitBalance, splitTotal, type SplitRow } from "@/lib/splits";
import { Badge, DataTable, LoadGate, Section, StatGrid } from "@/components/dashboard/ui";
import { ExportCsv } from "@/components/dashboard/ExportCsv";
import { EvidencePlayer } from "@/components/site/EvidencePlayer";
import { BrandMentions } from "./BrandMentions";
import { MonthlyPack } from "./MonthlyPack";
import { Reach } from "./Reach";
import { PlanRequests } from "./PlanRequests";
import { StationRequests } from "./StationRequests";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const BLOCKS = ["00–04", "04–08", "08–12", "12–16", "16–20", "20–24"];
const STATUS_LABEL: Record<DisputeStatus, string> = {
  open: "Open", resolved_a: "Awarded to A", resolved_b: "Awarded to B", resolved_split: "Split pro-rata", escalated: "Escalated",
};

function Registry({ rows }: { rows: Work[] }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"All" | Work["status"]>("All");
  const list = useMemo(() => {
    const n = q.trim().toLowerCase();
    return safeArray(rows).filter((w) => (status === "All" || w.status === status) && (!n || `${w.title} ${w.artist} ${w.owner} ${w.isrc}`.toLowerCase().includes(n)));
  }, [rows, q, status]);
  return (
    <Section id="registry" title="Master Catalogue Registry" actions={
      <div className="flex flex-wrap gap-2">
        <input className="input !w-56 !py-1.5" placeholder="Search title, owner, ISRC…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search registry" />
        <select className="input !w-36 !py-1.5" value={status} onChange={(e) => setStatus(e.target.value as typeof status)} aria-label="Status filter">
          {["All", "Registered", "Pending", "Conflict"].map((s) => <option key={s}>{s}</option>)}
        </select>
        <ExportCsv
          label="Export"
          sheets={[{
            subject: "east-sound-registry",
            headers: ["Title", "Artist", "Rights owner", "ISRC", "Status"],
            rows: list.map((w) => [w.title, w.artist, w.owner, w.isrc, w.status]),
          }]}
        />
      </div>
    }>
      <DataTable<Work> rows={list} rowKey={(r) => r.id} maxHeight={380} empty="No recordings match."
        columns={[
          { key: "title", header: "Title", render: (r) => <span className="font-medium text-white">{r.title}</span> },
          { key: "artist", header: "Artist", render: (r) => r.artist },
          { key: "owner", header: "Rights owner", render: (r) => r.owner },
          { key: "isrc", header: "ISRC", render: (r) => <span className="font-mono text-xs">{r.isrc || "—"}</span> },
          { key: "status", header: "Status", render: (r) => <Badge tone={r.status === "Registered" ? "ok" : r.status === "Pending" ? "warn" : "bad"}>{r.status}</Badge> },
        ]} />
      <p className="mt-3 text-xs text-slate-500">{list.length} of {safeArray(rows).length} recordings · Pending = no ISRC yet · Conflict = open dispute</p>
    </Section>
  );
}

function SplitCalculator() {
  const [pool, setPool] = useState("5000000");
  const [rows, setRows] = useState<SplitRow[]>([
    { id: 1, party: "Composer", role: "Writer", share: "50" },
    { id: 2, party: "Publisher", role: "Publisher", share: "30" },
    { id: 3, party: "Producer", role: "Producer", share: "20" },
  ]);
  const total = splitTotal(rows);
  const balance = splitBalance(total);
  const amounts = new Map(allocatePool(pool, rows).map((a) => [a.id, a.amount]));
  const update = (id: SplitRow["id"], patch: Partial<SplitRow>) => setRows((rs) => safeArray(rs).map((r) => (r.id === id ? { ...r, ...patch } : r)));
  return (
    <Section id="splits" title="Split Sheet Calculator">
      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <div className="space-y-2">
          {safeArray(rows).map((r) => (
            <div key={r.id} className="grid grid-cols-[1fr_120px_90px_110px_32px] items-center gap-2">
              <input className="input !py-2" value={r.party} onChange={(e) => update(r.id, { party: e.target.value })} aria-label="Party" />
              <select className="input !py-2" value={r.role} onChange={(e) => update(r.id, { role: e.target.value })} aria-label="Role">
                {["Writer", "Composer", "Publisher", "Producer", "Performer"].map((o) => <option key={o}>{o}</option>)}
              </select>
              <div className="relative">
                <input className="input !py-2 pr-6 text-right font-mono" inputMode="decimal" value={r.share} onChange={(e) => update(r.id, { share: sanitizeShare(e.target.value) })} aria-label="Share percent" />
                <span className="pointer-events-none absolute right-2 top-2 text-sm text-slate-500">%</span>
              </div>
              <span className="text-right font-mono text-sm text-slate-300">{fmtInt(amounts.get(r.id) ?? 0)}</span>
              <button type="button" aria-label="Remove party" onClick={() => setRows((rs) => safeArray(rs).filter((x) => x.id !== r.id))} className="text-slate-500 hover:text-rose-300">✕</button>
            </div>
          ))}
          <button type="button" className="btn-ghost !py-1.5 text-xs" onClick={() => setRows((rs) => [...safeArray(rs), { id: Date.now(), party: "New party", role: "Writer", share: "0" }])}>+ Add party</button>
        </div>
        <div className="space-y-4 rounded-xl border border-slate-800 bg-slate-950/60 p-4">
          <div>
            <label className="label" htmlFor="pool">Amount to split (UGX)</label>
            <input id="pool" className="input font-mono" inputMode="numeric" value={pool} onChange={(e) => setPool(e.target.value.replace(/\D/g, ""))} />
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-400">Total share</span>
            <span className={cx("font-mono font-bold", balance.balanced ? "text-emerald-300" : "text-rose-300")}>{total.toFixed(2)}%</span>
          </div>
          <Badge tone={balance.tone}>{balance.label}</Badge>
          <p className="text-xs text-slate-500">Total: {fmtUGX(pool)}</p>
        </div>
      </div>
    </Section>
  );
}

function Top100({ rows }: { rows: CmoData["top100"] }) {
  const [limit, setLimit] = useState(25);
  const list = safeArray(rows);
  return (
    <Section id="top100" title="National Top 100" actions={
      <div className="flex items-center gap-3">
        <span className="text-xs text-slate-500">Last 7 days · all monitored stations</span>
        <ExportCsv
          sheets={[{
            subject: "east-sound-top-100",
            headers: ["Rank", "Title", "Rights owner", "Spins", "Stations"],
            rows: list.map((r) => [r.rank, r.title, r.owner, r.spins, r.stations]),
          }]}
        />
      </div>
    }>
      <DataTable rows={list.slice(0, limit)} rowKey={(r) => `${r.rank}-${r.title}`} empty="No plays detected in the last 7 days."
        columns={[
          { key: "rank", header: "#", render: (r) => <span className={cx("font-mono font-bold", r.rank <= 10 ? "text-emerald-400" : "text-slate-500")}>{r.rank}</span> },
          { key: "title", header: "Title", render: (r) => <span className="font-medium text-white">{r.title}</span> },
          { key: "owner", header: "Owner", render: (r) => r.owner },
          { key: "spins", header: "Spins", render: (r) => <span className="font-mono">{fmtInt(r.spins)}</span>, className: "text-right" },
          { key: "stations", header: "Stations", render: (r) => <span className="font-mono">{r.stations}</span>, className: "text-right" },
        ]} />
      {limit < list.length && (
        <button type="button" className="btn-ghost mt-4 w-full !py-2" onClick={() => setLimit((l) => Math.min(100, l + 25))}>Show more ({limit} of {list.length})</button>
      )}
    </Section>
  );
}

function Heatmap({ regions, data }: { regions: string[]; data: number[][][] }) {
  const [region, setRegion] = useState(0);
  const grid = safeArray(data[region]);
  const max = Math.max(1, ...grid.flat());
  return (
    <Section id="heatmap" title="Regional Airplay Heatmap" actions={
      <div className="flex flex-wrap gap-2">
        {safeArray(regions).map((r, i) => <button key={r} type="button" onClick={() => setRegion(i)} className={cx("pill", region === i ? "pill-on" : "pill-off")}>{r}</button>)}
      </div>
    }>
      <div className="overflow-x-auto">
        <div className="grid min-w-[520px] grid-cols-[48px_repeat(6,1fr)] gap-1.5">
          <span />
          {BLOCKS.map((b) => <span key={b} className="text-center font-mono text-[10px] text-slate-500">{b}</span>)}
          {DAYS.map((d, di) => (
            <div key={d} className="contents">
              <span className="self-center text-xs text-slate-400">{d}</span>
              {safeArray(grid[di]).map((v, bi) => {
                const a = v / max;
                return (
                  <div key={bi} title={`${regions[region]} · ${d} ${BLOCKS[bi]} — ${v} plays`}
                    className="flex h-9 items-center justify-center rounded-md font-mono text-[10px] text-slate-950/80"
                    style={{ background: `rgba(52,211,153,${0.06 + a * 0.86})`, boxShadow: a > 0.75 ? "0 0 12px rgba(52,211,153,.5)" : undefined }}>
                    {a > 0.45 ? v : ""}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <p className="mt-3 text-xs text-slate-500">Plays in the last 7 days, Kampala time.</p>
    </Section>
  );
}

function Disputes({ initial }: { initial: Dispute[] }) {
  const [items, setItems] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const act = async (id: string, status: DisputeStatus) => {
    setBusy(id);
    setErr(null);
    try {
      await resolveDispute(id, status);
      setItems((xs) => safeArray(xs).map((d) => (d.id === id ? { ...d, status } : d)));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't save the decision.");
    } finally {
      setBusy(null);
    }
  };
  return (
    <Section id="disputes" title="Rights & Dispute Settlement">
      {err && <p role="alert" className="mb-3 text-sm text-rose-300">{err}</p>}
      {safeArray(items).length === 0 && <p className="text-sm text-slate-500">No disputes. 🎉</p>}
      <div className="space-y-3">
        {safeArray(items).map((d) => {
          const over = d.shareA + d.shareB - 100;
          const open = d.status === "open";
          return (
            <div key={d.id} className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-white">{d.work}</span>
                <Badge tone={open ? "warn" : d.status === "escalated" ? "bad" : "ok"}>{STATUS_LABEL[d.status]}</Badge>
                <span className="ml-auto text-xs text-slate-500">Opened {d.opened} · {fmtInt(d.spinsAtStake)} plays in 30 days</span>
              </div>
              <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                <p><span className="text-slate-500">A:</span> {d.claimantA} <span className="font-mono text-emerald-300">{d.shareA}%</span></p>
                <p><span className="text-slate-500">B:</span> {d.claimantB} <span className="font-mono text-emerald-300">{d.shareB}%</span></p>
              </div>
              {over > 0 && open && <p className="mt-2 text-xs text-rose-300">Claims total {d.shareA + d.shareB}% — royalties are held until this is settled.</p>}
              {open && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {([["resolved_a", "Award to A"], ["resolved_b", "Award to B"], ["resolved_split", "Split pro-rata"], ["escalated", "Escalate"]] as const).map(([s, l]) => (
                    <button key={s} type="button" disabled={busy === d.id} onClick={() => act(d.id, s)}
                      className={cx("btn-ghost !px-3 !py-1.5 text-xs", s === "escalated" && "!text-rose-300")}>{l}</button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Section>
  );
}

function UnmatchedQueue({ initial, works }: { initial: UnmatchedClip[]; works: CmoData["works"] }) {
  const [queue, setQueue] = useState(initial);
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const act = async (id: string, recordingId: string | null) => {
    setErr(null);
    try {
      await resolveUnmatched(id, recordingId);
      setQueue((q) => safeArray(q).filter((u) => u.id !== id));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't save.");
    }
  };
  return (
    <Section id="unmatched" title={`Unmatched Audio Queue (${safeArray(queue).length})`}>
      {err && <p role="alert" className="mb-3 text-sm text-rose-300">{err}</p>}
      <DataTable rows={queue} rowKey={(r) => r.id} empty="All caught up — every clip has been reviewed."
        columns={[
          { key: "play", header: "", render: (r) => <EvidencePlayer seed={r.seed} label={`clip from ${r.station}`} size="sm" resolveUrl={r.evidencePath ? () => evidenceUrl(r.evidencePath) : undefined} /> },
          { key: "station", header: "Heard on", render: (r) => r.station },
          { key: "heard", header: "When", render: (r) => <span className="font-mono text-xs">{fmtTime(r.heardAt, true)}</span> },
          {
            key: "match", header: "What is it?", render: (r) => (
              <div className="flex gap-2">
                <select className="input !w-48 !py-1.5 text-xs" value={choice[r.id] ?? ""} onChange={(e) => setChoice((c) => ({ ...c, [r.id]: e.target.value }))} aria-label="Match to recording">
                  <option value="">Pick a recording…</option>
                  {safeArray(works).map((w) => <option key={w.id} value={w.id}>{w.title}</option>)}
                </select>
                <button type="button" disabled={!choice[r.id]} className="btn-primary !px-3 !py-1.5 text-xs" onClick={() => act(r.id, choice[r.id])}>Match</button>
                <button type="button" className="btn-ghost !px-3 !py-1.5 text-xs" onClick={() => act(r.id, null)}>Not music</button>
              </div>
            ),
          },
        ]} />
    </Section>
  );
}

export function CmoDashboard() {
  // New detections and disputes land in this ledger without a page reload.
  const state = useLiveLoad(loadCmo, [], { tables: ["detections", "unmatched_clips", "disputes"] });
  return (
    <LoadGate state={state}>
      {(d) => (
        <>
          <section id="overview" className="scroll-mt-20">
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold text-white">National audit</h1>
              <Freshness live={state.live} lastUpdated={state.lastUpdated} />
            </div>
            <details className="mb-4 rounded-xl border border-slate-800 bg-slate-900/40 p-4 text-sm text-slate-400">
              <summary className="cursor-pointer font-medium text-slate-200">What this dashboard is for</summary>
              <ul className="mt-3 space-y-1.5">
                <li><span className="text-white">Distribution Pack</span> — the monthly per-station report a CMO files: plays, works, artists, evidence share; PDF and CSV.</li>
                <li><span className="text-white">Reach &amp; Impressions</span> — audience estimates, only for stations whose AQH someone declared.</li>
                <li><span className="text-white">Master Catalogue Registry</span> — every recording, its rights owner and ISRC status.</li>
                <li><span className="text-white">Split Sheet Calculator</span> — test a pool split before you agree to it.</li>
                <li><span className="text-white">National Top 100 / Regional Heatmap</span> — what the country is playing, and when.</li>
                <li><span className="text-white">Rights &amp; Disputes</span> — conflicting claims, with the plays at stake.</li>
                <li><span className="text-white">Unmatched Audio</span> — clips the matcher could not name; review them to grow the catalogue.</li>
                <li><span className="text-white">Station Requests</span> — approve a broadcaster claiming its station.</li>
                <li><span className="text-white">Plan Requests</span> — people who asked for a paid plan, with a reference to bill against.</li>
              </ul>
            </details>
            <StatGrid items={[
              { label: "Plays · 24h", value: fmtInt(d.stats.detections24h) },
              { label: "Matched", value: `${d.stats.matchedRate}%` },
              { label: "Open disputes", value: String(d.stats.openDisputes), tone: d.stats.openDisputes ? "warn" : "ok" },
              { label: "To review", value: String(d.stats.unmatched), tone: d.stats.unmatched ? "bad" : "ok" },
            ]} />
          </section>
          <MonthlyPack />
          <Reach />
          <Registry rows={d.registry} />
          <SplitCalculator />
          <Top100 rows={d.top100} />
          <Heatmap regions={d.regions} data={d.heatmap} />
          <Disputes initial={d.disputes} />
          <UnmatchedQueue initial={d.unmatched} works={d.works} />
          <StationRequests />
          <PlanRequests />
          <BrandMentions />
        </>
      )}
    </LoadGate>
  );
}
