"use client";

import { useEffect, useState } from "react";
import { Tv, Activity } from "lucide-react";
import { useLanguage } from "@/components/language-provider";

interface StationHealth {
  ok: boolean;
  status: number | null;
  latencyMs: number;
  streamKind: "hls" | "audio" | "unknown";
  checkedAt: string;
  error: string | null;
}

interface HealthFeed {
  id: string;
  name: string;
  country: string;
  city: string;
  medium: "FM" | "TV";
  frequency: string;
  source: string;
  verified: boolean;
  reference: boolean;
  health: StationHealth | null;
}

interface HealthSummary {
  updatedAt: string | null;
  total: number;
  reachable: number;
  avgLatencyMs: number | null;
  byCountry: Record<string, { total: number; reachable: number }>;
  feeds: HealthFeed[];
}

const COUNTRY_NAMES: Record<string, string> = {
  UG: "Uganda",
  KE: "Kenya",
  TZ: "Tanzania",
  RW: "Rwanda",
};

const COUNTRY_ORDER = ["UG", "KE", "TZ", "RW"];

function badgeStyles(ok: boolean | null): string {
  if (ok === null)
    return "border-slate-700/60 bg-slate-900/60 text-slate-500";
  if (ok)
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
  return "border-red-500/30 bg-red-500/10 text-red-300";
}

function formatRefreshed(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ago`;
}

export function PanelHealthStrip() {
  const { t } = useLanguage();
  const [data, setData] = useState<HealthSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let closed = false;
    const load = () =>
      fetch("/api/station-health", { cache: "no-store" })
        .then(async (response) => {
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return (await response.json()) as HealthSummary;
        })
        .then((body) => {
          if (!closed) {
            setData(body);
            setError(null);
          }
        })
        .catch(() => {
          if (!closed)
            setError("The live health feed could not be reached. Retrying…");
        });
    void load();
    const timer = setInterval(load, 90_000);
    return () => {
      closed = true;
      clearInterval(timer);
    };
  }, []);

  const feedsByCountry = new Map<string, HealthFeed[]>();
  for (const feed of data?.feeds ?? []) {
    const list = feedsByCountry.get(feed.country) ?? [];
    list.push(feed);
    feedsByCountry.set(feed.country, list);
  }

  return (
    <section
      aria-label={t("panelHealth.title")}
      className="group relative overflow-hidden rounded-3xl border border-white/10 bg-slate-900/60 p-5 shadow-2xl shadow-emerald-500/10 backdrop-blur-xl sm:p-6"
    >
      <div className="pointer-events-none absolute -top-24 -right-16 h-56 w-56 rounded-full bg-emerald-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -left-16 h-56 w-56 rounded-full bg-sky-500/10 blur-3xl" />

      <div className="relative">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="relative mt-1 flex h-3 w-3 shrink-0">
              {data && data.reachable > 0 && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
              )}
              <span
                className={`relative inline-flex h-3 w-3 rounded-full ${
                  data?.reachable ? "bg-emerald-400" : "bg-slate-600"
                }`}
              />
            </span>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-300">
                {t("panelHealth.eyebrow")}
              </p>
              <h2 className="text-lg font-bold text-white sm:text-xl">
                {t("panelHealth.title")}
              </h2>
              <p className="mt-0.5 text-xs text-slate-400">
                {t("panelHealth.subtitle")}
              </p>
            </div>
          </div>

          <div className="flex flex-col items-end gap-1.5 text-right">
            {data ? (
              <>
                <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-300">
                  {t("panelHealth.reachable", {
                    count: data.reachable,
                    total: data.total,
                  })}
                </span>
                {data.avgLatencyMs !== null && (
                  <span className="rounded-full border border-slate-700/60 bg-slate-900/60 px-3 py-1 text-[10px] font-semibold text-slate-300">
                    {t("panelHealth.avgLatency", {
                      ms: data.avgLatencyMs,
                    })}
                  </span>
                )}
                {data.updatedAt && (
                  <span className="text-[10px] uppercase tracking-wider text-slate-500">
                    {t("panelHealth.refreshed", {
                      time: formatRefreshed(data.updatedAt),
                    })}
                  </span>
                )}
              </>
            ) : error ? (
              <span className="text-[10px] uppercase tracking-wider text-amber-300">
                {t("panelHealth.unavailable")}
              </span>
            ) : (
              <span className="text-[10px] uppercase tracking-wider text-slate-500">
                {t("panelHealth.probing")}
              </span>
            )}
          </div>
        </header>

        {/* Market summary chips */}
        {data && (
          <div className="mt-4 flex flex-wrap gap-2">
            {COUNTRY_ORDER.map((code) => {
              const entry = data.byCountry[code];
              if (!entry) return null;
              return (
                <div
                  key={code}
                  className="rounded-xl border border-slate-800/80 bg-slate-950/50 px-3 py-2"
                >
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    {code} · {COUNTRY_NAMES[code]}
                  </p>
                  <p className="mt-0.5 text-sm font-semibold text-white">
                    <span className="text-emerald-300">
                      {entry.reachable}
                    </span>
                    <span className="text-slate-600"> / {entry.total}</span>
                  </p>
                </div>
              );
            })}
          </div>
        )}

        {/* Feed grid, grouped by market */}
        <div className="mt-5 space-y-5">
          {data && feedsByCountry.size === 0 && (
            <p className="text-sm text-slate-400">{t("panelHealth.probing")}</p>
          )}
          {[...feedsByCountry.entries()].map(([code, feeds]) => (
            <div key={code}>
              <div className="mb-2 flex items-center gap-2">
                <span className="rounded-md bg-slate-800/80 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-300">
                  {code} · {COUNTRY_NAMES[code] ?? code}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {feeds.map((feed) => (
                  <FeedBadge key={feed.id} feed={feed} t={t} />
                ))}
              </div>
            </div>
          ))}
        </div>

        <footer className="mt-5 flex items-center justify-between border-t border-slate-800/70 pt-3 text-[10px] uppercase tracking-wider text-slate-500">
          <span>
            {data?.updatedAt
              ? `${t("panelHealth.refreshed", { time: formatRefreshed(data.updatedAt) })}`
              : t("panelHealth.probing")}
          </span>
          <span className="flex items-center gap-1.5">
            <Activity className="h-3.5 w-3.5" />
            East Sound probes
          </span>
        </footer>
      </div>
    </section>
  );
}

function FeedBadge({
  feed,
  t,
}: {
  feed: HealthFeed;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  const health = feed.health;
  const ok = health?.ok ?? null;
  return (
    <div
      className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5 transition-colors ${
        ok
          ? "border-slate-800/80 bg-slate-950/50 hover:border-emerald-400/20"
          : ok === false
            ? "border-slate-800/80 bg-slate-950/50 hover:border-red-400/20"
            : "border-dashed border-slate-800/60 bg-slate-950/30"
      }`}
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-white">
          {feed.name}
          {feed.reference && (
            <span className="ml-2 rounded bg-sky-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-sky-300">
              {t("panelHealth.reference")}
            </span>
          )}
        </p>
        <p className="mt-0.5 flex items-center gap-1.5 text-[10px] text-slate-500">
          {feed.city}
          <span>·</span>
          {feed.medium === "TV" ? (
            <span className="flex items-center gap-1 font-bold uppercase">
              <Tv className="h-3 w-3" />
              {t("panelHealth.tv")}
            </span>
          ) : (
            <span className="font-bold uppercase">{t("panelHealth.fm")}</span>
          )}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span
          className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${badgeStyles(ok)}`}
        >
          {ok === null ? "—" : ok ? "● ONLINE" : "● OFFLINE"}
        </span>
        {health?.ok && (
          <span className="text-[9px] font-semibold text-slate-500">
            {
              health.streamKind === "hls"
                ? t("panelHealth.hls")
                : t("panelHealth.audio")
            }
            {" · "}
            {health.latencyMs}
            ms
          </span>
        )}
        {!health?.ok && health && (
          <span className="max-w-[8rem] truncate text-[9px] text-red-400/70">
            {health.error ?? "unreachable"}
          </span>
        )}
      </div>
    </div>
  );
}
