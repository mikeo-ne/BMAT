"use client";

import { useEffect, useMemo, useState } from "react";
import { Headphones, Radio } from "lucide-react";
import { FEED_PING_SEED, type FeedPing } from "@/lib/site-content";
import { playSnippet, type SnippetHandle } from "@/lib/snippet-audio";
import { useLanguage } from "@/components/language-provider";

interface RealStationHealth {
  ok: boolean;
  status: number | null;
  latencyMs: number;
  streamKind: "hls" | "audio" | "unknown";
  checkedAt: string;
  error: string | null;
}

interface RealFeedHealth {
  id: string;
  name: string;
  country: string;
  city: string;
  medium: "FM" | "TV";
  reference: boolean;
  health: RealStationHealth | null;
}

interface RealHealthSummary {
  updatedAt: string | null;
  total: number;
  reachable: number;
  avgLatencyMs: number | null;
  feeds: RealFeedHealth[];
}

/** Kampala-relevant feeds shown in the monitor's real-health row. */
const KAMPALA_FEED_IDS = [
  "ntv-uganda",
  "bukedde-tv-1",
  "bbs-tv",
  "kstv",
  "radio-maria-ug",
  "next-radio",
  "bbc-world-service",
];

interface LivePing extends FeedPing {
  at: number;
}

/** Captured once at module load so render stays pure (lint: no Date.now in render). */
const MOUNT_TIME = Date.now();

function buildInitialPings(now: number): LivePing[] {
  return FEED_PING_SEED.map((ping) => ({
    ...ping,
    at: now - ping.minutesAgo * 60_000,
  })).sort((a, b) => b.at - a.at);
}

function minutesSince(now: number, at: number): number {
  return Math.max(0, Math.round((now - at) / 60_000));
}

function confidenceStyle(confidence: number): string {
  if (confidence >= 0.9) return "text-emerald-300 border-emerald-500/30 bg-emerald-500/10";
  if (confidence >= 0.8) return "text-amber-300 border-amber-500/30 bg-amber-500/10";
  return "text-red-300 border-red-500/30 bg-red-500/10";
}

export function StreamMonitorCard() {
  const { t } = useLanguage();
  const [pings, setPings] = useState<LivePing[]>(() =>
    buildInitialPings(MOUNT_TIME),
  );
  const [now, setNow] = useState(MOUNT_TIME);
  const [playingKey, setPlayingKey] = useState<string | null>(null);
  const [handle, setHandle] = useState<SnippetHandle | null>(null);
  const [realHealth, setRealHealth] = useState<RealHealthSummary | null>(
    null,
  );

  // Real broadcast feed health from the public health API.
  useEffect(() => {
    let closed = false;
    const loadRealHealth = () =>
      fetch("/api/station-health", { cache: "no-store" })
        .then(async (response) => {
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return (await response.json()) as RealHealthSummary;
        })
        .then((body) => {
          if (!closed) setRealHealth(body);
        })
        .catch(() => {
          /* keep the previous health view on transient failure */
        });
    void loadRealHealth();
    const timer = setInterval(loadRealHealth, 90_000);
    return () => {
      closed = true;
      clearInterval(timer);
    };
  }, []);

  const toggleEvidence = (ping: LivePing) => {
    const key = `${ping.track}-${ping.artist}`;
    if (handle && playingKey === key) {
      handle.stop();
      setHandle(null);
      setPlayingKey(null);
      return;
    }
    const next = playSnippet(key.toLowerCase().replace(/\s+/g, "-"));
    if (next) {
      setHandle(next);
      setPlayingKey(key);
      window.setTimeout(() => setPlayingKey(null), 10_000);
    }
  };

  // Simulated panel feed: a new capture rotates in every few seconds.
  useEffect(() => {
    const timer = setInterval(() => {
      setPings((current) => {
        const next = [...current];
        const seed = FEED_PING_SEED[next.length % FEED_PING_SEED.length];
        next.unshift({ ...seed, minutesAgo: 0, at: Date.now() });
        return next.slice(0, 7);
      });
      setNow(Date.now());
    }, 2600);
    return () => clearInterval(timer);
  }, []);

  const elapsedLabels = useMemo(
    () => pings.map((ping) => minutesSince(now, ping.at)),
    [pings, now],
  );

  return (
    <section
      aria-label={t("monitor.title")}
      className="group relative overflow-hidden rounded-3xl border border-white/10 bg-slate-900/60 p-5 shadow-2xl shadow-emerald-500/10 backdrop-blur-xl sm:p-6"
    >
      {/* Glow accents */}
      <div className="pointer-events-none absolute -top-24 -right-16 h-56 w-56 rounded-full bg-emerald-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -left-16 h-56 w-56 rounded-full bg-sky-500/10 blur-3xl" />

      <div className="relative">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="relative flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-400" />
            </span>
            <div>
              <h2 className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-300">
                {t("monitor.title")}
              </h2>
              <p className="text-[11px] text-slate-400">{t("monitor.subtitle")}</p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-300">
            <Radio className="h-3.5 w-3.5" />
            {t("monitor.stations", { count: 32 })}
          </span>
        </header>

        {/* Real broadcast feed health */}
        <div className="mt-4 rounded-xl border border-slate-800/70 bg-slate-950/40 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-300">
              {t("monitor.realFeeds")}
            </p>
            <p className="text-[10px] text-slate-500">
              {t("monitor.realFeedsHint")}
            </p>
          </div>
          {realHealth ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {KAMPALA_FEED_IDS.map((id) => {
                const feed = realHealth.feeds.find((item) => item.id === id);
                if (!feed) return null;
                const health = feed.health;
                const ok = health?.ok ?? null;
                return (
                  <div
                    key={id}
                    className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 ${
                      ok
                        ? "border-emerald-500/30 bg-emerald-500/5"
                        : ok === false
                          ? "border-red-500/20 bg-red-500/5"
                          : "border-dashed border-slate-700/50 bg-slate-900/40"
                    }`}
                  >
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${
                        ok ? "bg-emerald-400" : ok === false ? "bg-red-400" : "bg-slate-600"
                      }`}
                    />
                    <span className="truncate text-xs font-semibold text-white">
                      {feed.name}
                    </span>
                    {health?.ok && (
                      <span className="shrink-0 text-[10px] font-bold text-slate-400">
                        {health.latencyMs}ms
                      </span>
                    )}
                    {!health?.ok && health && (
                      <span className="shrink-0 text-[9px] text-red-400/70">
                        off
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="mt-2 text-[11px] text-slate-500">
              {t("monitor.probing")}
            </p>
          )}
        </div>

        <div className="mt-4 min-h-[26rem] space-y-2">
          {pings.map((ping, index) => {
            const elapsed = elapsedLabels[index];
            const key = `${ping.track}-${ping.artist}`;
            return (
              <div
                key={`${ping.at}-${ping.station}-${index}`}
                className="animate-[fadeUp_0.45s_ease-out] rounded-xl border border-slate-800/80 bg-slate-950/50 px-3.5 py-3 transition-colors hover:border-emerald-400/20"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">
                      {ping.track}
                      <span className="text-slate-500"> — {ping.artist}</span>
                    </p>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {ping.station} · {ping.frequency} · {ping.location} ·{" "}
                      {elapsed <= 1 ? "just now" : `${elapsed}m ago`}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${confidenceStyle(ping.confidence)}`}
                    >
                      {Math.round(ping.confidence * 100)}%
                    </span>
                    <button
                      type="button"
                      onClick={() => toggleEvidence(ping)}
                      aria-label={`${t("monitor.evidence")}: ${ping.track}`}
                      className={`flex h-8 items-center gap-1 rounded-lg border px-2 text-[10px] font-bold transition-colors ${
                        playingKey === key
                          ? "border-emerald-400/50 bg-emerald-500/10 text-emerald-300"
                          : "border-slate-700 bg-slate-900/60 text-slate-400 hover:border-emerald-400/40 hover:text-emerald-300"
                      }`}
                    >
                      <Headphones className="h-3.5 w-3.5" />
                      {t("monitor.evidence")}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <footer className="mt-4 flex items-center justify-between border-t border-slate-800/70 pt-3 text-[10px] uppercase tracking-wider text-slate-500">
          <span>{t("monitor.recent")}</span>
          <span>{t("monitor.badge")}</span>
        </footer>
      </div>
    </section>
  );
}
