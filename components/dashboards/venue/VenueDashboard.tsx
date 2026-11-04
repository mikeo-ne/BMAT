"use client";

import { useState, type FormEvent } from "react";
import { addDjSet, loadVenue, type DjSet, type ListenerNode, type VenueData } from "@/lib/db/venue";
import { useLoad } from "@/lib/db/core";
import { cx, safeArray } from "@/lib/safe";
import { Badge, DataTable, LoadGate, SaveNote, Section, StatGrid } from "@/components/dashboard/ui";

const STATUS = {
  compliant: { text: "Compliant", dot: "bg-emerald-400", ring: "border-emerald-400/40 bg-emerald-400/10 text-emerald-300", note: "Licence active and every listener node is reporting." },
  "at-risk": { text: "At risk", dot: "bg-amber-400", ring: "border-amber-400/40 bg-amber-400/10 text-amber-300", note: "A listener node is offline, so some plays may not be logged." },
  "non-compliant": { text: "Not compliant", dot: "bg-rose-400", ring: "border-rose-400/40 bg-rose-400/10 text-rose-300", note: "No valid licence on file. Contact UPRS to renew." },
} as const;

function LogSet({ venueId, onSaved }: { venueId: string | null; onSaved: () => void }) {
  const [dj, setDj] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [save, setSave] = useState<{ kind: "idle" | "saving" | "saved" | "error"; msg?: string }>({ kind: "idle" });
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const s = new Date(start);
    const f = new Date(end);
    if (!dj.trim() || Number.isNaN(s.getTime()) || Number.isNaN(f.getTime()) || f <= s) {
      setSave({ kind: "error", msg: "Enter the DJ and a start time before the end time." });
      return;
    }
    setSave({ kind: "saving" });
    try {
      await addDjSet(venueId, dj.trim(), s.toISOString(), f.toISOString());
      setDj(""); setStart(""); setEnd("");
      setSave({ kind: "saved" });
      onSaved();
    } catch (err) {
      setSave({ kind: "error", msg: err instanceof Error ? err.message : undefined });
    }
  };
  return (
    <form onSubmit={submit} className="mb-4 flex flex-wrap items-end gap-2">
      <label className="text-xs text-slate-400">DJ<input className="input mt-1 !w-48 !py-2" value={dj} onChange={(e) => setDj(e.target.value)} maxLength={80} /></label>
      <label className="text-xs text-slate-400">Started<input type="datetime-local" className="input mt-1 !w-52 !py-2" value={start} onChange={(e) => setStart(e.target.value)} /></label>
      <label className="text-xs text-slate-400">Ended<input type="datetime-local" className="input mt-1 !w-52 !py-2" value={end} onChange={(e) => setEnd(e.target.value)} /></label>
      <button className="btn-primary !py-2" disabled={save.kind === "saving"}>Log set</button>
      <SaveNote state={save} />
    </form>
  );
}

export function VenueDashboard() {
  const state = useLoad(loadVenue);
  return <LoadGate state={state}>{(d) => <VenueView d={d} reload={state.reload} />}</LoadGate>;
}

function VenueView({ d, reload }: { d: VenueData; reload: () => void }) {
  const nodes = safeArray(d.nodes);
  const offline = nodes.filter((n) => n.status === "offline").length;
  const s = STATUS[d.compliance.status] ?? STATUS["at-risk"];
  return (
    <>
      <section id="overview" className="scroll-mt-20 space-y-4">
        <h1 className="text-2xl font-bold text-white">{d.venueName}</h1>
        <div className={cx("glass flex flex-wrap items-center gap-5 p-5", d.compliance.status === "compliant" && "shadow-glow")}>
          <span className={cx("inline-flex items-center gap-2.5 rounded-full border px-4 py-2 text-base font-bold", s.ring)}>
            <span className={cx("h-3 w-3 rounded-full", s.dot)} />
            UPRS Public Performance · {s.text}
          </span>
          <div className="text-sm">
            <p className="text-slate-300">{s.note}</p>
            <p className="font-mono text-xs text-slate-500">Licence {d.compliance.licence} · renews {d.compliance.renews}</p>
          </div>
        </div>
        <StatGrid items={[
          { label: "Listener nodes", value: String(nodes.length) },
          { label: "Offline", value: String(offline), tone: offline ? "bad" : "ok" },
          { label: "Tracks · 24h", value: String(nodes.reduce((a, n) => a + (n.tracksToday || 0), 0)) },
          { label: "DJ sets logged", value: String(safeArray(d.sets).length) },
        ]} />
      </section>

      <Section id="nodes" title="Listener Nodes">
        <DataTable<ListenerNode> rows={nodes} rowKey={(r) => r.id} empty="No listener nodes installed yet."
          columns={[
            { key: "id", header: "Node", render: (r) => <span className="font-mono text-xs">{r.code}</span> },
            { key: "loc", header: "Location", render: (r) => <span className="text-white">{r.location}</span> },
            { key: "type", header: "Type", render: (r) => r.type },
            { key: "st", header: "Status", render: (r) => <Badge tone={r.status === "online" ? "ok" : r.status === "degraded" ? "warn" : "bad"}>{r.status}</Badge> },
            { key: "hb", header: "Last heard", render: (r) => <span className="font-mono text-xs">{r.lastHeartbeat}</span> },
            { key: "tr", header: "Tracks · 24h", render: (r) => <span className="font-mono">{r.tracksToday}</span>, className: "text-right" },
          ]} />
      </Section>

      <Section id="djsets" title="DJ Set Logs">
        <LogSet venueId={d.venueId} onSaved={reload} />
        <DataTable<DjSet> rows={d.sets} rowKey={(r) => r.id} empty="No DJ sets logged yet."
          columns={[
            { key: "dj", header: "DJ", render: (r) => <span className="font-medium text-white">{r.dj}</span> },
            { key: "t", header: "Set", render: (r) => <span className="font-mono text-xs">{r.start} – {r.end}</span> },
            { key: "n", header: "Tracks heard", render: (r) => <span className="font-mono">{r.tracks}</span>, className: "text-right" },
            { key: "m", header: "Identified", render: (r) => {
              if (!r.tracks) return <span className="text-xs text-slate-500">—</span>;
              const p = Math.round((r.matched / r.tracks) * 100);
              return <Badge tone={p >= 95 ? "ok" : p >= 85 ? "warn" : "bad"}>{p}%</Badge>;
            } },
          ]} />
      </Section>
    </>
  );
}
