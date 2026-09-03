"use client";

import { Waveform } from "@/components/waveform";
import { formatClock, formatLatency, formatRatio, timeAgo } from "@/lib/format";
import { MATCH_THRESHOLD, type Detection, type MonitoredStation, type StationTelemetry } from "@/lib/monitoring";

const STATUS_STYLE: Record<
  StationTelemetry["status"],
  { label: string; dot: string; text: string; ring: string }
> = {
  online: { label: "Live", dot: "var(--accent)", text: "text-accent", ring: "border-accent/40" },
  degraded: { label: "Degraded", dot: "var(--brand)", text: "text-brand", ring: "border-brand/40" },
  offline: { label: "Offline", dot: "#f87171", text: "text-red-300", ring: "border-red-500/40" },
};

interface StationCardProps {
  station: MonitoredStation;
  telemetry: StationTelemetry;
  active: boolean;
  analyser: AnalyserNode | null;
  volume: number;
  onTogglePlay: () => void;
  onVolumeChange: (volume: number) => void;
  lastDetection: Detection | undefined;
}

export function StationCard({
  station,
  telemetry,
  active,
  analyser,
  volume,
  onTogglePlay,
  onVolumeChange,
  lastDetection,
}: StationCardProps) {
  const status = STATUS_STYLE[telemetry.status];
  const playable = telemetry.status !== "offline";
  const matched = lastDetection ? lastDetection.track !== null && lastDetection.confidence >= MATCH_THRESHOLD : false;

  return (
    <article
      className={[
        "panel flex flex-col gap-3 p-3.5 transition-colors",
        active ? "border-brand/60" : "",
        telemetry.status === "offline" ? "opacity-70" : "",
      ].join(" ")}
      aria-label={`${station.name} ${station.frequency}`}
    >
      {/* Identity + status */}
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={[
                "h-2 w-2 shrink-0 rounded-full",
                telemetry.status === "online" ? "animate-pulse-dot" : "",
              ].join(" ")}
              style={{ background: status.dot }}
              aria-hidden
            />
            <h3 className="truncate text-sm font-semibold tracking-tight">{station.name}</h3>
          </div>
          <p className="mt-0.5 truncate text-[11px] text-muted">
            <span className="font-mono">{station.frequency}</span> · {station.location} ·{" "}
            {station.region}
          </p>
        </div>

        <span
          className={[
            "shrink-0 rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider",
            station.medium === "TV"
              ? "border-line bg-surface-2 text-muted"
              : "border-brand/40 bg-brand/10 text-brand",
          ].join(" ")}
        >
          {station.medium}
        </span>
      </header>

      {/* Status line */}
      <div
        className={[
          "flex items-center justify-between gap-2 rounded-lg border bg-surface-2/60 px-2.5 py-1.5 text-[11px]",
          status.ring,
        ].join(" ")}
      >
        <span className={["font-medium", status.text].join(" ")}>{status.label}</span>
        <span className="flex items-center gap-2.5 font-mono text-muted tabular-nums">
          <span title="Feed latency">⏱ {formatLatency(telemetry.latencyMs)}</span>
          <span title="Uptime over the last 24 hours">↑ {formatRatio(telemetry.uptime, 1)}</span>
        </span>
      </div>

      {/* Waveform */}
      <Waveform
        analyser={active ? analyser : null}
        active={active}
        label={`${station.name} monitor feed waveform`}
      />

      {/* Player widget */}
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={onTogglePlay}
          disabled={!playable}
          className={[
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors",
            !playable
              ? "cursor-not-allowed border border-line bg-surface-2 text-muted"
              : active
                ? "bg-brand text-brand-ink hover:brightness-110"
                : "border border-line bg-surface-2 text-foreground hover:border-muted",
          ].join(" ")}
          aria-label={active ? `Mute ${station.name} monitor feed` : `Monitor ${station.name} feed`}
          aria-pressed={active}
        >
          {active ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <rect x="6" y="5" width="4" height="14" rx="1" />
              <rect x="14" y="5" width="4" height="14" rx="1" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M8 5.5v13l11-6.5-11-6.5z" />
            </svg>
          )}
        </button>

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(volume * 100)}
            onChange={(e) => onVolumeChange(Number(e.target.value) / 100)}
            disabled={!playable}
            aria-label={`${station.name} monitor volume`}
            className="h-1 w-full cursor-pointer appearance-none rounded-full bg-line accent-brand disabled:cursor-not-allowed disabled:opacity-50"
          />
          {/* Signal level history */}
          <div className="flex h-3 items-end gap-[2px]" aria-hidden>
            {telemetry.level.slice(-20).map((value, i) => (
              <span
                key={i}
                className="flex-1 rounded-[1px] transition-all duration-300"
                style={{
                  height: `${Math.max(6, value * 100)}%`,
                  background: telemetry.status === "offline" ? "var(--line)" : status.dot,
                  opacity: telemetry.status === "offline" ? 0.5 : 0.25 + value * 0.6,
                }}
              />
            ))}
          </div>
        </div>

        <span className="shrink-0 font-mono text-[10px] text-muted tabular-nums">
          {Math.round(volume * 100)}
        </span>
      </div>

      {/* Last detected track */}
      <div
        className={[
          "mt-auto rounded-lg border px-2.5 py-2",
          !lastDetection
            ? "border-dashed border-line bg-surface-2/40"
            : matched
              ? "border-accent/30 bg-accent/5"
              : "border-red-500/25 bg-red-500/5",
        ].join(" ")}
      >
        <p className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-wider text-muted">
          <span>Last detected track</span>
          {lastDetection && <span className="font-mono normal-case">{formatClock(lastDetection.detectedAt)}</span>}
        </p>

        {lastDetection && lastDetection.track ? (
          <>
            <p className="mt-1 truncate text-xs font-medium">{lastDetection.track.title}</p>
            <p className="truncate text-[11px] text-muted">
              {lastDetection.track.primaryArtist} ·{" "}
              <span className="font-mono">{lastDetection.track.isrc}</span>
            </p>
          </>
        ) : (
          <p className="mt-1 text-xs text-muted">
            {lastDetection ? "Unmatched audio — not in the catalogue" : "No detection yet"}
          </p>
        )}

        {lastDetection && (
          <div className="mt-1.5 flex items-center gap-2">
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-background">
              <span
                className="block h-full rounded-full transition-all duration-500"
                style={{
                  width: `${Math.min(100, lastDetection.confidence * 100)}%`,
                  background: matched ? "var(--accent)" : "#f87171",
                }}
              />
            </div>
            <span
              className={[
                "shrink-0 font-mono text-[10px] tabular-nums",
                matched ? "text-accent" : "text-red-300",
              ].join(" ")}
            >
              {(lastDetection.confidence * 100).toFixed(1)}%
            </span>
          </div>
        )}

        {lastDetection && (
          <p className="mt-1 text-[10px] text-muted">{timeAgo(lastDetection.detectedAt)}</p>
        )}
      </div>
    </article>
  );
}
