"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseBrowser } from "@/lib/supabase/client";

/** Client for live mode, or null in demo mode. */
export function db(): SupabaseClient | null {
  return getSupabaseBrowser();
}

/** Throws a readable error for a failed Supabase call. */
export function must<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return (res.data ?? ([] as unknown as T)) as T;
}

export type Load<T> = { data: T | null; error: string | null; loading: boolean; reload: () => void };

/** Runs an async loader after mount (never during render) and exposes reload. */
export function useLoad<T>(loader: () => Promise<T>, deps: unknown[] = []): Load<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const ref = useRef(loader);
  ref.current = loader;

  useEffect(() => {
    let alive = true;
    setLoading(true);
    ref
      .current()
      .then((d) => alive && (setData(d), setError(null)))
      .catch((e: unknown) => alive && setError(e instanceof Error ? e.message : "Could not load data."))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, ...deps]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, reload };
}

/** Signed, short-lived URL for an evidence clip. Storage RLS decides access. */
export async function evidenceUrl(path: string | null | undefined): Promise<string | null> {
  const sb = db();
  if (!sb || !path) return null;
  const { data, error } = await sb.storage.from("evidence").createSignedUrl(path, 300);
  if (error) throw new Error("This clip isn't available to your account.");
  return data?.signedUrl ?? null;
}

export const EAT = "Africa/Kampala";
export function fmtTime(iso: string | null | undefined, withDate = false): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", {
    timeZone: EAT,
    hour: "2-digit",
    minute: "2-digit",
    ...(withDate ? { day: "2-digit", month: "short" } : {}),
  });
}

export function kampalaDate(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: EAT }).format(d); // YYYY-MM-DD
}
