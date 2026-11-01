"use client";
import { useEffect, useState } from "react";
import { isStoredCapturedSpin } from "@/lib/captured-airplay";
import type { BroadcastSpin } from "@/lib/playout";

/** API polling observes captured data only. Static exports never request an absent API. */
export function useCapturedFeed(
  initial: BroadcastSpin[],
  initialNow: string,
  canPoll = false,
) {
  const [snapshot, setSnapshot] = useState({
    events: initial,
    now: initialNow,
  });
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    if (!canPoll) return;
    let closed = false;
    let inFlight = false;
    let controller: AbortController | null = null;
    const refresh = async () => {
      if (inFlight || document.visibilityState === "hidden") return;
      inFlight = true;
      controller = new AbortController();
      const timeout = window.setTimeout(() => controller?.abort(), 10000);
      try {
        const prefix = window.location.pathname.split("/dashboard")[0];
        const response = await fetch(`${prefix}/api/playout`, {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!response.ok) throw new Error("Capture feed unavailable");
        const body = await response.json();
        if (
          !Array.isArray(body.records) ||
          typeof body.generatedAt !== "string" ||
          !Number.isFinite(Date.parse(body.generatedAt)) ||
          body.records.some((row: unknown) => !isStoredCapturedSpin(row)) ||
          new Set(body.records.map((row: BroadcastSpin) => row.id)).size !==
            body.records.length
        )
          throw new Error("Invalid capture feed");
        if (!closed) {
          setSnapshot({ events: body.records, now: body.generatedAt });
          setUnavailable(false);
        }
      } catch {
        if (!closed) setUnavailable(true);
      } finally {
        window.clearTimeout(timeout);
        inFlight = false;
      }
    };
    void refresh();
    const visible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", visible);
    const timer = window.setInterval(refresh, 15000);
    return () => {
      closed = true;
      controller?.abort();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [canPoll]);
  return { ...snapshot, unavailable };
}
