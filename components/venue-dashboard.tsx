"use client";

import { useMemo } from "react";
import {
  Activity,
  CheckCircle2,
  Clock3,
  Disc3,
  MapPin,
  Martini,
  ShieldCheck,
} from "lucide-react";
import type { VenueNode, VenuePing } from "@/lib/site-content";

interface LoggedPing extends VenuePing {
  id: string;
}

/**
 * Venue Operator dashboard.
 *
 * Every node and ping arrives pre-scoped from the server: this component can
 * only ever render the venues the signed-in operator was assigned, so no other
 * venue's ambient activity can bleed into the workspace.
 */
export function VenueDashboard({
  nodes,
  pings,
}: {
  nodes: VenueNode[];
  pings: VenuePing[];
}) {
  const safeNodes = nodes || [];

  // Relative labels come straight from the server payload, so SSR and the
  // client render identical markup and no effect-time clock can drift.
  const ordered = useMemo<LoggedPing[]>(
    () =>
      (pings || [])
        .map((ping, index) => ({
          ...ping,
          id: `${ping.venue}-${ping.track}-${index}`,
        }))
        .sort((a, b) => a.minutesAgo - b.minutesAgo)
        .slice(0, 25),
    [pings],
  );

  const compliant = safeNodes.filter(
    (node) => node.compliance === "compliant",
  ).length;
  const pending = safeNodes.length - compliant;
  const pings24h = safeNodes.reduce(
    (total, node) => total + (node.pings24h || 0),
    0,
  );
  const activeNodes = safeNodes.filter((node) => node.active).length;

  const allCompliant = safeNodes.length > 0 && pending === 0;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-400">
            Venue operator
          </p>
          <h2 className="text-lg font-bold text-white">Ambient listener nodes</h2>
          <p className="mt-1 max-w-2xl text-xs text-slate-400">
            Bars, lounges, clubs and hotels report ambient playout from their
            registered node. Only your assigned venues appear here.
          </p>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold ${
            allCompliant
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
              : "border-amber-500/30 bg-amber-500/10 text-amber-300"
          }`}
        >
          <ShieldCheck className="h-3.5 w-3.5" />
          {safeNodes.length === 0
            ? "No node assigned"
            : allCompliant
              ? "🟢 UPRS public performance compliant"
              : `⏳ ${pending} node${pending === 1 ? "" : "s"} pending UPRS review`}
        </span>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Assigned nodes", value: safeNodes.length },
          { label: "Active nodes", value: activeNodes },
          { label: "Ambient plays (24h)", value: pings24h },
          { label: "Compliant", value: compliant },
        ].map((metric) => (
          <div
            key={metric.label}
            className="rounded-2xl border border-white/10 bg-slate-900/60 p-4"
          >
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              {metric.label}
            </p>
            <p className="mt-1 text-xl font-bold text-white">{metric.value}</p>
          </div>
        ))}
      </div>

      <section className="rounded-2xl border border-white/10 bg-slate-900/60 p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <Martini className="h-4 w-4 text-rose-300" />
          <h3 className="text-sm font-bold text-white">Your venues</h3>
        </div>
        {safeNodes.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-slate-700 bg-slate-950/40 p-4 text-xs text-slate-400">
            No venue node is linked to this account yet. Once operations assign
            your node (for example <code>UG-VEN-001</code>), ambient logs and the
            UPRS compliance badge appear here automatically.
          </p>
        ) : (
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {safeNodes.map((node) => (
              <div
                key={node.id}
                className="flex items-center justify-between gap-2 rounded-xl border border-slate-800/80 bg-slate-950/50 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">
                    {node.name}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-[10px] text-slate-500">
                    <MapPin className="h-3 w-3" />
                    {node.location} · {node.nodeId}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span
                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                      node.compliance === "compliant"
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                        : "border-amber-500/30 bg-amber-500/10 text-amber-300"
                    }`}
                  >
                    {node.compliance === "compliant" ? (
                      <CheckCircle2 className="h-3 w-3" />
                    ) : (
                      <Clock3 className="h-3 w-3" />
                    )}
                    {node.compliance === "compliant" ? "Compliant" : "Pending"}
                  </span>
                  <span className="text-[9px] font-semibold text-slate-500">
                    {node.active ? `${node.pings24h} pings/24h` : "Inactive"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-white/10 bg-slate-900/60 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-emerald-300" />
            <h3 className="text-sm font-bold text-white">
              Ambient activity log
            </h3>
          </div>
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            Resident DJ sets
          </span>
        </div>

        {ordered.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-slate-700 bg-slate-950/40 p-4 text-xs text-slate-400">
            No ambient plays recorded for your nodes in this window.
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[540px] text-left text-xs">
              <thead>
                <tr className="text-[10px] uppercase tracking-[0.14em] text-slate-500">
                  <th className="py-2 pr-3 font-semibold">Venue</th>
                  <th className="py-2 pr-3 font-semibold">Track</th>
                  <th className="py-2 pr-3 font-semibold">Artist</th>
                  <th className="py-2 pr-3 font-semibold">Set</th>
                  <th className="py-2 font-semibold">Played</th>
                </tr>
              </thead>
              <tbody>
                {(ordered || []).map((ping) => (
                  <tr
                    key={ping.id}
                    className="border-t border-slate-800/70 text-slate-300"
                  >
                    <td className="py-2 pr-3 font-semibold text-white">
                      {ping.venue}
                    </td>
                    <td className="py-2 pr-3">{ping.track}</td>
                    <td className="py-2 pr-3 text-slate-400">{ping.artist}</td>
                    <td className="py-2 pr-3">
                      <span className="inline-flex items-center gap-1 text-slate-400">
                        <Disc3 className="h-3 w-3" />
                        {ping.type}
                      </span>
                    </td>
                    <td className="py-2 text-slate-400">
                      {formatAgo(ping.minutesAgo)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function formatAgo(minutes: number): string {
  const safe = Math.max(0, Math.round(minutes));
  if (safe < 1) return "just now";
  if (safe < 60) return `${safe}m ago`;
  const hours = Math.floor(safe / 60);
  return `${hours}h ${safe % 60}m ago`;
}
