"use client";

import { useEffect, useRef, useState } from "react";
import { getAudioContext, playEvidenceSnippet, type SnippetHandle } from "@/lib/audio";
import { cx } from "@/lib/safe";

/**
 * 10-second audible evidence player. AudioContext is created only inside onClick.
 * Live mode passes `resolveUrl`, which fetches a short-lived signed URL for the
 * clip (storage rules decide access). Demo mode synthesises a placeholder.
 */
export function EvidencePlayer({ seed, url, resolveUrl, label, size = "md" }: {
  seed: number; url?: string; resolveUrl?: () => Promise<string | null>; label: string; size?: "sm" | "md";
}) {
  const [state, setState] = useState<"idle" | "loading" | "playing" | "error">("idle");
  const [progress, setProgress] = useState(0);
  const handle = useRef<SnippetHandle | null>(null);
  const raf = useRef<number | null>(null);
  const started = useRef(0);

  useEffect(
    () => () => {
      if (raf.current) cancelAnimationFrame(raf.current);
      handle.current?.stop();
    },
    [],
  );

  const tick = () => {
    const h = handle.current;
    if (!h) return;
    const p = Math.min(1, (performance.now() - started.current) / (h.duration * 1000));
    setProgress(p);
    if (p < 1) raf.current = requestAnimationFrame(tick);
  };

  const onClick = async () => {
    if (state === "playing") {
      handle.current?.stop();
      return;
    }
    const audio = getAudioContext(); // user gesture → safe on mobile
    if (!audio) {
      setState("error");
      return;
    }
    setState("loading");
    try {
      const clip = url ?? (resolveUrl ? await resolveUrl() : undefined) ?? undefined;
      if (resolveUrl && !clip) throw new Error("No evidence clip stored for this play.");
      handle.current = await playEvidenceSnippet(audio, {
        seed,
        url: clip,
        seconds: 10,
        onEnded: () => {
          if (raf.current) cancelAnimationFrame(raf.current);
          handle.current = null;
          setProgress(0);
          setState("idle");
        },
      });
      started.current = performance.now();
      setState("playing");
      raf.current = requestAnimationFrame(tick);
    } catch {
      setState("error");
    }
  };

  const dim = size === "sm" ? "h-8 w-8" : "h-9 w-9";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={state === "playing" ? `Stop evidence for ${label}` : `Play 10-second evidence for ${label}`}
      title={state === "error" ? "Audio unavailable in this browser" : "10s audible evidence"}
      className={cx(
        "relative inline-flex shrink-0 items-center justify-center rounded-full border transition",
        dim,
        state === "playing" ? "border-emerald-400 bg-emerald-400/15 text-emerald-300 shadow-glow-sm" : "border-slate-700 text-slate-300 hover:border-emerald-400/60 hover:text-emerald-300",
        state === "error" && "border-rose-500/50 text-rose-300",
      )}
    >
      <svg className="absolute inset-0 -rotate-90" viewBox="0 0 36 36" aria-hidden>
        <circle cx="18" cy="18" r="16" fill="none" stroke="#34d399" strokeWidth="2" strokeDasharray={`${progress * 100.5} 100.5`} />
      </svg>
      {state === "playing" ? (
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden><rect x="2" y="2" width="8" height="8" rx="1" fill="currentColor" /></svg>
      ) : state === "loading" ? (
        <span className="h-3 w-3 animate-spin rounded-full border-2 border-emerald-400 border-t-transparent" />
      ) : (
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden><path d="M3 1.5v9l7.5-4.5z" fill="currentColor" /></svg>
      )}
    </button>
  );
}
