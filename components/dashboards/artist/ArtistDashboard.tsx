"use client";

import { useMemo } from "react";
import { loadArtist, type Track } from "@/lib/db/artist";
import { useLoad } from "@/lib/db/core";
import { useAuth } from "@/lib/auth-context";
import { cx, fmtInt, fmtUGX, safeArray } from "@/lib/safe";
import { Badge, DataTable, LineChart, LoadGate, Section, StatGrid } from "@/components/dashboard/ui";
import { WhatsAppAlerts } from "@/components/dashboard/WhatsAppAlerts";

export function ArtistDashboard() {
  const { session } = useAuth();
  const state = useLoad(loadArtist);
  return (
    <LoadGate state={state}>
      {(d) => <ArtistView d={d} name={session?.displayName} scope={`artist_${session?.userId ?? "anon"}`} />}
    </LoadGate>
  );
}

function ArtistView({ d, name, scope }: { d: Awaited<ReturnType<typeof loadArtist>>; name?: string; scope: string }) {
  const byWork = useMemo(() => {
    const m = new Map<string, { party: string; share: number }[]>();
    for (const s of safeArray(d.splits)) m.set(s.work, [...(m.get(s.work) ?? []), { party: s.party, share: s.share }]);
    return Array.from(m.entries());
  }, [d.splits]);
  const v = safeArray(d.velocity);
  const now7 = v.slice(-7).reduce((a, b) => a + b, 0);
  const prev7 = v.slice(-14, -7).reduce((a, b) => a + b, 0);
  const growth = prev7 ? Math.round(((now7 - prev7) / prev7) * 100) : 0;

  return (
    <>
      <section id="overview" className="scroll-mt-20">
        <h1 className="mb-4 text-2xl font-bold text-white">Welcome back{name ? `, ${name}` : ""}</h1>
        <StatGrid items={[
          { label: "Tracks", value: String(d.stats.tracks) },
          { label: "Plays · 30 days", value: fmtInt(d.stats.spins30d) },
          { label: "Stations playing you", value: String(d.stats.stations) },
          { label: "Royalties (estimated)", value: fmtUGX(d.stats.estRoyaltyUgx), hint: "This month, before CMO distribution" },
        ]} />
      </section>

      <Section id="discography" title="Discography">
        <DataTable<Track> rows={d.discography} rowKey={(r) => r.id} empty="No recordings linked to your account yet."
          columns={[
            { key: "t", header: "Title", render: (r) => <span className="font-medium text-white">{r.title}</span> },
            { key: "y", header: "Year", render: (r) => r.year ?? "—" },
            { key: "isrc", header: "ISRC", render: (r) => <span className="font-mono text-xs">{r.isrc || "—"}</span> },
            { key: "s", header: "Plays · 30 days", render: (r) => <span className="font-mono">{fmtInt(r.spins30d)}</span>, className: "text-right" },
            { key: "tr", header: "This week", render: (r) => <span className={cx("font-mono text-xs", r.trend >= 0 ? "text-emerald-400" : "text-rose-400")}>{r.trend >= 0 ? "▲" : "▼"} {Math.abs(r.trend)}%</span>, className: "text-right" },
          ]} />
      </Section>

      <Section id="velocity" title={`Spin Velocity${d.leadTitle ? ` · ${d.leadTitle}` : ""}`} actions={v.length ? <Badge tone={growth >= 0 ? "ok" : "bad"}>{growth >= 0 ? "+" : ""}{growth}% vs last week</Badge> : undefined}>
        <LineChart values={v} label="Daily plays over the last 14 days" />
        {v.length > 1 && <p className="mt-2 text-xs text-slate-500">Daily plays, last 14 days · today {v[v.length - 1]}</p>}
      </Section>

      <Section id="splits" title="Split Sheet">
        {byWork.length === 0 && <p className="text-sm text-slate-500">No splits registered yet.</p>}
        <div className="grid gap-4 md:grid-cols-2">
          {byWork.map(([work, parties]) => (
            <div key={work} className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
              <p className="font-semibold text-white">{work}</p>
              <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-slate-800">
                {safeArray(parties).map((p, i) => <span key={p.party} style={{ width: `${p.share}%`, opacity: 1 - i * 0.25 }} className="bg-emerald-400" title={`${p.party} ${p.share}%`} />)}
              </div>
              <ul className="mt-3 space-y-1 text-sm">
                {safeArray(parties).map((p) => <li key={p.party} className="flex justify-between"><span className="text-slate-400">{p.party}</span><span className="font-mono text-emerald-300">{p.share}%</span></li>)}
              </ul>
            </div>
          ))}
        </div>
      </Section>

      <Section id="alerts" title="WhatsApp Alerts">
        <WhatsAppAlerts scope={scope} />
      </Section>
    </>
  );
}
