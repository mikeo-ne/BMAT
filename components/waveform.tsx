"use client";

import { useEffect, useRef } from "react";

interface WaveformProps {
  /** Live analyser from the monitor feed; null renders an idle baseline. */
  analyser: AnalyserNode | null;
  active: boolean;
  color?: string;
  height?: number;
  label: string;
}

/**
 * Real-time oscilloscope for a station's monitor feed.
 *
 * Reads the analyser's time-domain buffer on every animation frame — no synthetic
 * animation. When the feed is paused the trace settles to the baseline so an
 * idle card cannot be mistaken for a live one.
 */
export function Waveform({
  analyser,
  active,
  color = "var(--brand)",
  height = 56,
  label,
}: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return; // headless/SSR render

    const buffer = analyser ? new Uint8Array(analyser.frequencyBinCount) : null;

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const width = canvas.clientWidth;
      const cssHeight = canvas.clientHeight;

      if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(cssHeight * dpr)) {
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(cssHeight * dpr);
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, cssHeight);

      const mid = cssHeight / 2;

      // Baseline + centre rule
      ctx.strokeStyle = "rgba(139,154,181,0.18)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, mid);
      ctx.lineTo(width, mid);
      ctx.stroke();

      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.6;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";

      if (analyser && buffer && active) {
        analyser.getByteTimeDomainData(buffer);
        const step = width / buffer.length;

        for (let i = 0; i < buffer.length; i++) {
          const v = (buffer[i] - 128) / 128; // -1..1
          const y = mid + v * (cssHeight / 2 - 3);
          const x = i * step;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
      } else {
        // Idle: a whisper of noise so the card reads "connected but silent",
        // amplitude tied to the station's last reported level.
        ctx.moveTo(0, mid);
        ctx.lineTo(width, mid);
      }

      ctx.stroke();

      if (analyser && active) {
        ctx.shadowBlur = 0;
      }

      frameRef.current = requestAnimationFrame(draw);
    };

    frameRef.current = requestAnimationFrame(draw);

    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    };
  }, [analyser, active, color]);

  return (
    <div className="relative w-full overflow-hidden rounded-lg border border-line bg-background">
      <canvas
        ref={canvasRef}
        style={{ height }}
        className="block w-full"
        role="img"
        aria-label={label}
      />
      <span
        className={[
          "absolute right-1.5 top-1.5 rounded px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider",
          active ? "bg-brand/15 text-brand" : "bg-surface-2 text-muted",
        ].join(" ")}
      >
        {active ? "live" : "idle"}
      </span>
    </div>
  );
}
