"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  CheckCircle2,
  Clock3,
  MapPin,
  Music2,
  ShieldCheck,
  Martini,
} from "lucide-react";
import { VENUE_NODES, VENUE_PINGS, type VenuePing } from "@/lib/site-content";
import { useLanguage } from "@/components/language-provider";

interface LiveVenuePing extends VenuePing {
  at: number;
}

const MOUNT_TIME = Date.now();

function buildInitialPings(now: number): LiveVenuePing[] {
  return VENUE_PINGS.map((ping) => ({
    ...ping,
    at: now - ping.minutesAgo * 60_000,
  })).sort((a, b) => b.at - a.at);
}

function minutesSince(now: number, at: number): number {
  return Math.max(0, Math.round((now - at) / 60_000));
}

export function VenueMonitor() {
  const { t } = useLanguage();
  const [pings, setPings] = useState<LiveVenuePing[]>(() =>
    buildInitialPings(MOUNT_TIME),
  );
  const [now, setNow] = useState(MOUNT_TIME);

  // Ambient pings rotate in like a real venue feed.
  useEffect(() => {
    const timer = setInterval(() => {
      setPings((current) => {
        const next = [...current];
        const seed = VENUE_PINGS[next.length % VENUE_PINGS.length];
        next.unshift({ ...seed, minutesAgo: 0, at: Date.now() });
        return next.slice(0, 6);
      });
      setNow(Date.now());
    }, 3200);
    return () => clearInterval(timer);
  }, []);

  const elapsedLabels = useMemo(
    () => pings.map((ping) => minutesSince(now, ping.at)),
    [pings, now],
  );

    const compliantCount = VENUE_NODES.filter(
    (node) => node.compliance === "compliant",
  ).length;

  return (
    <section
      aria-label={t("venues.title")}
      className="group relative overflow-hidden rounded-3xl border border-white/10 bg-slate-900/60 p-5 shadow-2xl shadow-rose-500/10 backdrop-blur-xl sm:p-6"
    >
      <div className="pointer-events-none absolute -top-24 -right-16 h-56 w-56 rounded-full bg-rose-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -left-16 h-56 w-56 rounded-full bg-emerald-500/10 blur-3xl" />

      <div className="relative">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="relative mt-1 flex h-3 w-3 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-70" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-rose-400" />
            </span>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-rose-300">
                {t("venues.eyebrow")}
              </p>
              <h2 className="text-lg font-bold text-white sm:text-xl">
                {t("venues.title")}
              </h2>
              <p className="mt-0.5 text-xs text-slate-400">
                {t("venues.subtitle")}
              </p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5 text-right">
            <span className="rounded-full border border-rose-500/30 bg-rose-500/10 px-3 py-1 text-xs font-bold text-rose-300">
              {t("venues.nodes", { count: VENUE_NODES.length })}
            </span>
            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-300">
              🟢 {t("venues.compliant", { count: compliantCount })}
            </span>
          </div>
        </header>

        {/* Venue node grid */}
        <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {VENUE_NODES.map((node) => (
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
                  {node.compliance === "compliant"
                    ? t("venues.compliantBadge")
                    : t("venues.pendingBadge")}
                </span>
                <span className="text-[9px] font-semibold text-slate-500">
                  {node.active ? `${node.pings24h} pings/24h` : t("venues.inactive")}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Ambient ping feed */}
        <div className="mt-5 min-h-[18rem] space-y-2">
          {pings.map((ping, index) => {
            const elapsed = elapsedLabels[index];
            return (
              <div
                key={`${ping.at}-${ping.venue}-${index}`}
                className="animate-[fadeUp_0.45s_ease-out] rounded-xl border border-slate-800/80 bg-slate-950/50 px-3.5 py-3 transition-colors hover:border-rose-400/20"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">
                      {ping.track}
                      <span className="text-slate-500"> — {ping.artist}</span>
                    </p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-400">
                      <Martini className="h-3 w-3 text-rose-300/70" />
                      {ping.venue} · {ping.type} · {ping.location} ·{" "}
                      {elapsed <= 1 ? "just now" : `${elapsed}m ago`}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                        ping.compliance === "compliant"
                          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                          : "border-amber-500/30 bg-amber-500/10 text-amber-300"
                      }`}
                    >
                      {ping.compliance === "compliant" ? (
                        <ShieldCheck className="h-3 w-3" />
                      ) : (
                        <Clock3 className="h-3 w-3" />
                      )}
                      {ping.compliance === "compliant"
                        ? "UPRS ✓"
                        : "pending"}
                    </span>
                    <span className="flex items-center gap-1 text-[9px] font-semibold text-slate-500">
                      <Music2 className="h-3 w-3" />
                      {t("venues.ambient")}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <footer className="mt-4 flex items-center justify-between border-t border-slate-800/70 pt-3 text-[10px] uppercase tracking-wider text-slate-500">
          <span>{t("venues.recent")}</span>
          <span className="flex items-center gap-1.5">
            <Activity className="h-3.5 w-3.5" />
            {t("venues.badge")}
          </span>
        </footer>
      </div>
    </section>
  );
}
