"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { db, type Load } from "./core";

/**
 * "Live data" was true only on first paint: every dashboard loaded once and
 * then sat still until you reloaded the page. For airplay tracking that is the
 * wrong shape — a playout timeline is stale within seconds of opening it.
 *
 * `useLiveLoad` keeps a screen current with two cheap mechanisms:
 *   • a background poll (default 20s), skipped while the tab is hidden
 *   • a Supabase Realtime subscription, when the table is in the publication,
 *     which refreshes immediately on a new detection
 *
 * It never flashes a skeleton for a background refresh, and a failed refresh
 * keeps the last good data on screen instead of blanking the dashboard.
 */

export type LiveLoad<T> = Load<T> & {
  /** Realtime channel is subscribed (live mode only — demo mode polls). */
  live: boolean;
  /** Epoch ms of the last successful read. */
  lastUpdated: number | null;
  /** How many background refreshes landed — handy for debugging staleness. */
  refreshes: number;
};

export type LiveOptions = {
  /** Background poll interval in ms. */
  intervalMs?: number;
  /** Tables to subscribe to for instant updates (live mode only). */
  tables?: string[];
};

export const DEFAULT_INTERVAL_MS = 20_000;
const REALTIME_DEBOUNCE_MS = 250;

export function useLiveLoad<T>(
  loader: () => Promise<T>,
  deps: unknown[] = [],
  opts: LiveOptions = {},
): LiveLoad<T> {
  const { intervalMs = DEFAULT_INTERVAL_MS, tables = [] } = opts;
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [live, setLive] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [refreshes, setRefreshes] = useState(0);
  const [tick, setTick] = useState(0);

  const alive = useRef(true);
  const inFlight = useRef(false);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  /** `background` refreshes must not clear the table or show a spinner. */
  const run = useCallback(async (background: boolean) => {
    if (inFlight.current) return;
    inFlight.current = true;
    if (!background) setLoading(true);
    try {
      const next = await loaderRef.current();
      if (!alive.current) return;
      setData(next);
      setError(null);
      setLastUpdated(Date.now());
      if (background) setRefreshes((n) => n + 1);
    } catch (err) {
      if (!alive.current) return;
      setError(err instanceof Error ? err.message : "Could not load data.");
    } finally {
      inFlight.current = false;
      if (alive.current && !background) setLoading(false);
    }
  }, []);

  // First read, and any explicit reload / dependency change.
  useEffect(() => {
    void run(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, ...deps]);

  // Background poll — paused while the tab is hidden so a forgotten dashboard
  // in a background tab doesn't hammer the database all night.
  useEffect(() => {
    const id = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      void run(true);
    }, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, run, tick, ...deps]);

  // Returning to the tab should feel instant, not wait for the next tick.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const onVisible = () => {
      if (document.visibilityState === "visible") void run(true);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [run]);

  // Instant updates on new detections. Debounced: one play can fire several
  // change events, and we only want one read per burst.
  useEffect(() => {
    const client = db();
    if (!client || tables.length === 0) {
      setLive(false);
      return;
    }
    let timer: ReturnType<typeof setTimeout> | null = null;
    const bump = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void run(true), REALTIME_DEBOUNCE_MS);
    };
    const channel = client
      .channel(`est-live:${tables.join("+")}`)
      .on(
        "postgres_changes" as never,
        { event: "*", schema: "public", table: tables.length === 1 ? tables[0] : undefined } as never,
        bump,
      )
      .subscribe((status: string) => {
        if (alive.current) setLive(status === "SUBSCRIBED");
      });
    return () => {
      if (timer) clearTimeout(timer);
      setLive(false);
      void client.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tables.join("+"), run]);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  return { data, error, loading, reload, live, lastUpdated, refreshes };
}

/** "Live · updated 8s ago" — ticks once a second, no polling of its own. */
export function Freshness({
  live,
  lastUpdated,
  intervalMs = DEFAULT_INTERVAL_MS,
}: {
  live: boolean;
  lastUpdated: number | null;
  intervalMs?: number;
}) {
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const seconds = lastUpdated ? Math.max(0, Math.round((Date.now() - lastUpdated) / 1000)) : null;
  const stale = seconds !== null && seconds > Math.max(intervalMs / 1000, 5) * 2;

  return (
    <span
      className="inline-flex items-center gap-2 rounded-full border border-slate-800 bg-slate-900/60 px-2.5 py-1 text-[11px] font-medium text-slate-400"
      title={live ? "Subscribed to Supabase Realtime" : "Polling — realtime is unavailable in demo mode"}
    >
      <span
        aria-hidden
        className={
          "h-1.5 w-1.5 rounded-full " +
          (live ? "bg-emerald-400 animate-pulse" : stale ? "bg-amber-400" : "bg-slate-500")
        }
      />
      {live ? "Live" : "Auto-refresh"}
      <span className="text-slate-500">
        {seconds === null ? "loading…" : seconds < 2 ? "updated just now" : `updated ${seconds}s ago`}
      </span>
    </span>
  );
}
