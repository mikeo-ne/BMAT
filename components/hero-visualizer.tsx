"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Hero Web Audio canvas visualizer.
 *
 * Renders an animated equaliser + waveform on a canvas driven by the Web Audio
 * API. No microphone is required: a soft synthesized pad feeds an AnalyserNode
 * so the bars genuinely respond to audio, and the loop starts on the first
 * user gesture (browser autoplay policy). Before that the canvas idles on a
 * gentle procedural wave so the hero never looks static.
 */
export function HeroVisualizer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<{
    context: AudioContext;
    analyser: AnalyserNode;
    nodes: AudioNode[];
  } | null>(null);
  const startedRef = useRef(false);
  const [supported, setSupported] = useState(true);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setSupported(false);
      return;
    }

    let raf = 0;
    let phase = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio ?? 1;
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
    };
    resize();
    window.addEventListener("resize", resize);

    const draw = () => {
      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);

      const analyser = audioRef.current?.analyser;
      const buffer = analyser ? analyser.frequencyBinCount : 0;
      const data = buffer ? new Uint8Array(buffer) : null;

      // Equaliser bars across the bottom.
      const bars = 40;
      const gap = 3 * (window.devicePixelRatio ?? 1);
      const barWidth = Math.max(2, (width - gap * (bars - 1)) / bars);
      for (let i = 0; i < bars; i += 1) {
        const t = i / bars;
        let value: number;
        if (data && analyser) {
          const bin = Math.floor((i / bars) * (buffer * 0.75));
          value = (data[bin] ?? 0) / 255;
        } else {
          // Idle procedural wave: smooth sine ripples.
          value =
            0.28 +
            0.22 *
              Math.abs(
                Math.sin(phase * 0.05 + t * Math.PI * 2.2) *
                  Math.cos(phase * 0.021 - t * Math.PI * 1.4),
              );
        }
        const barHeight = Math.max(4, value * height * 0.62);
        const x = i * (barWidth + gap);
        const y = height - barHeight;
        const grad = ctx.createLinearGradient(0, y, 0, height);
        grad.addColorStop(0, "rgba(52, 211, 153, 0.95)");
        grad.addColorStop(1, "rgba(52, 211, 153, 0.15)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barHeight, barWidth / 2);
        ctx.fill();
      }

      // Waveform across the middle.
      ctx.strokeStyle = "rgba(52, 211, 153, 0.55)";
      ctx.lineWidth = 2 * (window.devicePixelRatio ?? 1);
      ctx.beginPath();
      const samples = 96;
      for (let i = 0; i <= samples; i += 1) {
        const t = i / samples;
        let value: number;
        if (data && analyser) {
          const bin = Math.floor(t * (buffer * 0.5));
          value = ((data[bin] ?? 0) / 255) * 0.8;
        } else {
          value =
            0.5 +
            0.3 *
              Math.sin(phase * 0.06 + t * Math.PI * 6) *
              Math.sin(phase * 0.03 - t * Math.PI * 2);
        }
        const x = t * width;
        const y = height * 0.42 + (value - 0.5) * height * 0.34;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      phase += 1;
      raf = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      audioRef.current?.nodes.forEach((node) => node.disconnect());
      audioRef.current = null;
      startedRef.current = false;
      setStarted(false);
    };
  }, []);

  const startAudio = () => {
    if (startedRef.current || started || !supported) return;
    const AudioCtx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) {
      setSupported(false);
      return;
    }
    try {
      const context = new AudioCtx();
      const analyser = context.createAnalyser();
      analyser.fftSize = 128;

      // Soft synthesized pad: two detuned oscillators through a low gain.
      const master = context.createGain();
      master.gain.value = 0.05;
      const filter = context.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 900;
      master.connect(filter);
      filter.connect(analyser);
      analyser.connect(context.destination);

      const oscillators: OscillatorNode[] = [];
      const frequencies = [110, 164.81, 220, 329.63];
      for (const frequency of frequencies) {
        const osc = context.createOscillator();
        osc.type = "sine";
        osc.frequency.value = frequency;
        osc.connect(master);
        osc.start();
        oscillators.push(osc);
      }

      audioRef.current = {
        context,
        analyser,
        nodes: [master, filter, ...oscillators],
      };
      startedRef.current = true;
      setStarted(true);
    } catch {
      setSupported(false);
    }
  };

  return (
    <div
      className="relative aspect-[16/10] w-full overflow-hidden rounded-2xl border border-slate-800/70 bg-slate-950/60"
      onClick={startAudio}
      role="img"
      aria-label="Live audio visualizer — click to enable sound"
    >
      <canvas ref={canvasRef} className="h-full w-full" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent" />
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          startAudio();
        }}
        className={`absolute bottom-3 left-1/2 flex h-11 -translate-x-1/2 items-center gap-2 rounded-full border px-4 text-xs font-bold backdrop-blur-xl transition-colors ${
          started
            ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
            : "border-white/15 bg-slate-950/70 text-slate-300 hover:border-emerald-400/40"
        }`}
      >
        {started ? (
          <>
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
            Live audio drive
          </>
        ) : (
          <>
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            Tap for live audio
          </>
        )}
      </button>
      {!supported && (
        <p className="absolute right-3 top-3 text-[10px] text-slate-500">
          Web Audio unavailable — visualizer runs in idle mode
        </p>
      )}
    </div>
  );
}
