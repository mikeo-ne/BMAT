"use client";

import { useEffect, useRef, useState } from "react";
import { getAudioContext, playEvidenceSnippet, type SnippetHandle } from "@/lib/audio";
import { useI18n } from "@/lib/i18n";
import { PLAYOUT_TICKER } from "@/lib/data/public";
import { safeArray } from "@/lib/safe";
import { LiveBadge } from "./Header";
import { isSupabaseConfigured } from "@/lib/supabase/config";

function Visualizer() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const analyser = useRef<AnalyserNode | null>(null);
  const handle = useRef<SnippetHandle | null>(null);
  const [listening, setListening] = useState(false);

  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext("2d");
    if (!el || !ctx) return;

    let raf = 0;
    let w = 0;
    let h = 0;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = el.clientWidth;
      h = el.clientHeight;
      el.width = Math.max(1, Math.floor(w * dpr));
      el.height = Math.max(1, Math.floor(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
    ro?.observe(el);

    const bars = 48;
    const freq = new Uint8Array(128);
    const draw = (time: number) => {
      ctx.clearRect(0, 0, w, h);
      const a = analyser.current;
      if (a) a.getByteFrequencyData(freq);
      if (w < 20 || h < 10) {
        raf = requestAnimationFrame(draw); // not measured yet — try next frame
        return;
      }
      const gap = w < 400 ? 2 : 3;
      const bw = Math.max(1, (w - gap * (bars - 1)) / bars);
      for (let i = 0; i < bars; i++) {
        const v = a
          ? (freq[Math.floor((i / bars) * 90)] ?? 0) / 255
          : 0.18 + 0.14 * Math.sin(time / 600 + i * 0.45) + 0.08 * Math.sin(time / 230 + i * 1.3);
        const bh = Math.max(2, v * h * 0.85);
        const x = i * (bw + gap);
        const y = (h - bh) / 2;
        const g = ctx.createLinearGradient(0, y, 0, y + bh);
        g.addColorStop(0, "rgba(110,231,183,0.95)");
        g.addColorStop(1, "rgba(16,185,129,0.25)");
        ctx.fillStyle = g;
        ctx.shadowColor = "rgba(52,211,153,0.6)";
        ctx.shadowBlur = a ? 12 : 6;
        ctx.beginPath();
        if (typeof ctx.roundRect === "function") ctx.roundRect(x, y, bw, bh, Math.max(0, Math.min(bw, bh) / 2));
        else ctx.rect(x, y, bw, bh);
        ctx.fill();
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      handle.current?.stop();
    };
  }, []);

  const toggle = async () => {
    if (listening) {
      handle.current?.stop();
      return;
    }
    const audio = getAudioContext(); // created on click only
    if (!audio) return;
    try {
      handle.current = await playEvidenceSnippet(audio, {
        seed: 3,
        seconds: 10,
        onEnded: () => {
          analyser.current = null;
          handle.current = null;
          setListening(false);
        },
      });
      analyser.current = handle.current.analyser;
      setListening(true);
    } catch {
      setListening(false);
    }
  };

  return (
    <div className="glass relative overflow-hidden border-emerald-400/15 p-5 shadow-2xl shadow-emerald-950/30">
      <div className="mb-3 flex items-center justify-between text-xs">
        <span className="font-mono uppercase tracking-widest text-emerald-400/80">Vericast · live matcher</span>
        <span className="font-mono text-slate-500">11 kHz · landmark fingerprints</span>
      </div>
      <canvas ref={canvas} className="h-40 w-full sm:h-48" aria-hidden />
      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">{listening ? "Sample match: Kampala Nights" : "Idle signal monitor"}</p>
          <p className="text-xs text-slate-500">{listening ? "Example of an evidence clip" : "Tap to hear a sample evidence clip"}</p>
        </div>
        <button type="button" onClick={toggle} className={listening ? "btn-ghost !py-2" : "btn-primary !py-2"}>
          {listening ? "Stop" : "▶ Listen"}
        </button>
      </div>
    </div>
  );
}

/** Sample plays for the demo site only — a live site never shows made-up airplay. */
function Ticker() {
  if (isSupabaseConfigured) return null;
  const items = safeArray(PLAYOUT_TICKER);
  const loop = [...items, ...items];
  return (
    <div className="relative mt-8 overflow-hidden rounded-xl border border-slate-800 bg-slate-950/70">
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-10 bg-gradient-to-r from-slate-950" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-10 bg-gradient-to-l from-slate-950" />
      <div className="flex w-max animate-marquee gap-8 py-2.5 pl-4 hover:[animation-play-state:paused]">
        {loop.map((it, i) => (
          <span key={i} className="flex items-center gap-2 whitespace-nowrap text-xs">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            <span className="font-semibold text-white">{it.station}</span>
            <span className="font-mono text-slate-500">{it.freq}</span>
            <span className="text-slate-400">{it.track}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

export function Hero() {
  const { t } = useI18n();
  const go = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });

  return (
    <section className="relative overflow-hidden">
      {/* Studio backdrop: grid, glow, concentric speaker rings */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_70%_20%,rgba(16,185,129,0.18),transparent_55%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.05)_1px,transparent_1px)] bg-[size:48px_48px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" />
        <svg className="absolute -right-40 top-10 h-[640px] w-[640px] opacity-30" viewBox="0 0 400 400">
          {[40, 80, 120, 160, 196].map((r) => (
            <circle key={r} cx="200" cy="200" r={r} fill="none" stroke="#34d399" strokeOpacity={0.5 - r / 500} strokeWidth="1" />
          ))}
        </svg>
      </div>

      <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 pb-16 pt-14 sm:px-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:pb-24 lg:pt-20">
        <div className="min-w-0">
          <div className="xl:hidden">
            <LiveBadge />
          </div>
          <h1 className="mt-5 text-4xl font-extrabold leading-[1.05] tracking-tight text-white [overflow-wrap:anywhere] sm:text-5xl xl:text-6xl">
            {t("heroTitle")}
          </h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-400 sm:text-lg">{t("heroSub")}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <button type="button" className="btn-primary px-6 py-3 text-base" onClick={() => go("charts")}>
              {t("ctaCharts")}
            </button>
            <button type="button" className="btn-ghost px-6 py-3 text-base" onClick={() => go("use-cases")}>
              {t("ctaUseCase")}
            </button>
          </div>
          <Ticker />
        </div>
        <Visualizer />
      </div>
    </section>
  );
}
