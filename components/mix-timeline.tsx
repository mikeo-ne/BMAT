"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  buildTransitions,
  formatTimeline,
  MIX_DURATION_SEC,
  type MixSegment,
} from "@/lib/mix-parser";

interface MixTimelineProps {
  segments: MixSegment[];
  /** Downsampled amplitude envelope, 0-1. */
  waveform: number[];
  stationName: string;
  onSeek: (second: number) => void;
  /** Segment currently under the playhead. */
  currentSegment: MixSegment | null;
  currentSecond: number;
}

const KIND_COLOR: Record<MixSegment["kind"], string> = {
  track: "var(--accent)",
  unidentified: "var(--brand)",
  speech: "var(--muted)",
  "ad-break": "var(--region-northern)",
};

/**
 * One hour of station audio as a seekable waveform.
 *
 * The trace is an SVG polyline over the downsampled envelope, with each segment
 * tinted by what the parser made of it and a marker at every music hand-over.
 * Clicking or dragging anywhere seeks; the playhead advances on a timer while
 * playing, since there is no real hour-long stream behind it.
 */
export function MixTimeline({
  segments,
  waveform,
  stationName,
  onSeek,
  currentSegment,
  currentSecond,
}: MixTimelineProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hoverSecond, setHoverSecond] = useState<number | null>(null);

  const transitions = useMemo(() => buildTransitions(segments), [segments]);

  // Downsample the envelope so the DOM stays cheap: ~420 bars across the hour.
  const bars = useMemo(() => {
    const target = 420;
    if (waveform.length <= target) return waveform;
    const bucket = waveform.length / target;
    return Array.from({ length: target }, (_, i) => {
      const start = Math.floor(i * bucket);
      const end = Math.max(start + 1, Math.floor((i + 1) * bucket));
      let peak = 0;
      for (let j = start; j < end && j < waveform.length; j++) {
        if (waveform[j] > peak) peak = waveform[j];
      }
      return peak;
    });
  }, [waveform]);

  const seekFromEvent = useCallback(
    (clientX: number) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      onSeek(Math.round(ratio * MIX_DURATION_SEC));
    },
    [onSeek],
  );

  // Advance the playhead in real time while playing.
  useEffect(() => {
    if (!isPlaying) return;

    const timer = window.setInterval(() => {
      const next = currentSecond + 1;
      if (next >= MIX_DURATION_SEC) {
        setIsPlaying(false);
        onSeek(0);
        return;
      }
      onSeek(next);
    }, 1000);

    return () => window.clearInterval(timer);
  }, [isPlaying, currentSecond, onSeek]);

  const width = 1000;
  const height = 132;
  const mid = height / 2;
  const barStep = width / bars.length;
  const xFor = (second: number) => (second / MIX_DURATION_SEC) * width;

  return (
    <section className="panel p-4" aria-labelledby="mix-timeline-heading">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="mix-timeline-heading" className="text-sm font-semibold tracking-tight">
            Continuous station audio
          </h2>
          <p className="mt-1 text-xs text-muted">
            {stationName} · 60 minutes · {segments.length} segments · {transitions.length} track
            transitions
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span className="font-mono text-sm tabular-nums" aria-live="off">
            {formatTimeline(currentSecond)}
            <span className="text-muted"> / {formatTimeline(MIX_DURATION_SEC)}</span>
          </span>
          <button
            type="button"
            onClick={() => setIsPlaying((p) => !p)}
            aria-pressed={isPlaying}
            className={isPlaying ? "btn" : "btn btn-primary"}
          >
            {isPlaying ? "Pause" : "Play hour"}
          </button>
        </div>
      </div>

      <div className="relative mt-4">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          className="block w-full cursor-crosshair rounded-lg border border-line bg-background"
          role="img"
          aria-label={`Waveform of one hour of ${stationName} audio. Currently at ${formatTimeline(currentSecond)}.`}
          onClick={(e) => seekFromEvent(e.clientX)}
          onMouseMove={(e) => {
            const rect = svgRef.current?.getBoundingClientRect();
            if (!rect) return;
            const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            setHoverSecond(Math.round(ratio * MIX_DURATION_SEC));
          }}
          onMouseLeave={() => setHoverSecond(null)}
        >
          {/* Segment bands, so the parser's verdict is legible before you look closer. */}
          {segments.map((segment) => (
            <rect
              key={`band-${segment.id}`}
              x={xFor(segment.startSec)}
              y={0}
              width={Math.max(xFor(segment.endSec) - xFor(segment.startSec), 1)}
              height={height}
              fill={KIND_COLOR[segment.kind]}
              opacity={segment.kind === "unidentified" ? 0.16 : 0.06}
            />
          ))}

          {/* Waveform, mirrored about the centre line. */}
          {bars.map((value, i) => {
            const barHeight = Math.max(value * (height / 2 - 6), 1);
            const segment =
              segments.find(
                (s) => i * barStep >= xFor(s.startSec) && i * barStep < xFor(s.endSec),
              ) ?? segments[0];
            return (
              <rect
                key={`bar-${i}`}
                x={i * barStep}
                y={mid - barHeight}
                width={Math.max(barStep - 0.6, 0.6)}
                height={barHeight * 2}
                fill={KIND_COLOR[segment?.kind ?? "track"]}
                opacity={0.75}
              />
            );
          })}

          {/* Transition markers. */}
          {transitions.map((transition, i) => (
            <g key={`transition-${i}`}>
              <line
                x1={xFor(transition.atSec)}
                y1={4}
                x2={xFor(transition.atSec)}
                y2={height - 4}
                stroke="var(--foreground)"
                strokeWidth={0.8}
                opacity={0.5}
              />
              <circle cx={xFor(transition.atSec)} cy={8} r={2.4} fill="var(--foreground)" opacity={0.7} />
            </g>
          ))}

          {/* Playhead. */}
          <line
            x1={xFor(currentSecond)}
            y1={0}
            x2={xFor(currentSecond)}
            y2={height}
            stroke="var(--brand)"
            strokeWidth={1.4}
          />

          {hoverSecond !== null ? (
            <line
              x1={xFor(hoverSecond)}
              y1={0}
              x2={xFor(hoverSecond)}
              y2={height}
              stroke="var(--muted)"
              strokeWidth={0.7}
              strokeDasharray="3 3"
            />
          ) : null}
        </svg>

        {/* Hour ruler. */}
        <div className="mt-1 flex justify-between font-mono text-[10px] text-muted">
          {[0, 10, 20, 30, 40, 50, 60].map((minute) => (
            <span key={minute}>{formatTimeline(minute * 60)}</span>
          ))}
        </div>
      </div>

      {/* Now playing under the playhead. */}
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted">Under the playhead:</span>
        {currentSegment ? (
          <>
            <span
              className="chip"
              style={{ color: KIND_COLOR[currentSegment.kind] }}
            >
              {currentSegment.kind === "track"
                ? "Matched"
                : currentSegment.kind === "unidentified"
                  ? "Unidentified"
                  : currentSegment.kind}
            </span>
            <span className="font-medium">
              {currentSegment.title ?? "No confident match"}
              {currentSegment.artist ? ` — ${currentSegment.artist}` : ""}
            </span>
            {currentSegment.confidence !== null ? (
              <span className="font-mono text-muted">
                {Math.round(currentSegment.confidence * 100)}% confidence
              </span>
            ) : null}
            <span className="font-mono text-muted">
              {formatTimeline(currentSegment.startSec)}–{formatTimeline(currentSegment.endSec)}
            </span>
          </>
        ) : (
          <span className="text-muted">—</span>
        )}
      </div>
    </section>
  );
}
