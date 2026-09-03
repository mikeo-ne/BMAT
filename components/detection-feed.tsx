"use client";

import { useMemo, useState } from "react";

import { formatClock, timeAgo } from "@/lib/format";
import { MATCH_THRESHOLD, isMatched, stationById, type Detection } from "@/lib/monitoring";

type FeedFilter = "all" | "matched" | "unmatched";

interface DetectionFeedProps {
  detections: Detection[];
  onClear: () => void;
}

const FILTERS: { id: FeedFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "matched", label: "Matched" },
  { id: "unmatched", label: "Unmatched" },
];

export function DetectionFeed({ detections, onClear }: DetectionFeedProps) {
  const [filter, setFilter] = useState<FeedFilter>("all");

  const rows = useMemo(() => {
    if (filter === "all") return detections;
    const want = filter === "matched";
    return detections.filter((d) => isMatched(d) === want);
  }, [detections, filter]);

  const counts = useMemo(
    () => ({
      all: detections.length,
      matched: detections.filter(isMatched).length,
      unmatched: detections.filter((d) => !isMatched(d)).length,
    }),
    [detections],
  );

  return (
    <section className="panel flex min-h-0 flex-col" aria-labelledby="feed-heading">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-line px-4 py-3.5">
        <div>
          <h2 id="feed-heading" className="text-sm font-semibold tracking-tight">
            Live detection feed
          </h2>
          <p className="text-xs text-muted">
            Fingerprint matches against the delivered catalogue, newest first.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg border border-line bg-surface-2 p-0.5">
            {FILTERS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setFilter(option.id)}
                aria-pressed={filter === option.id}
                className={[
                  "rounded px-2 py-1 text-[11px] transition-colors",
                  filter === option.id
                    ? "bg-brand text-brand-ink"
                    : "text-muted hover:text-foreground",
                ].join(" ")}
              >
                {option.label}
                <span className="ml-1 font-mono tabular-nums opacity-70">{counts[option.id]}</span>
              </button>
            ))}
          </div>

          <button
            type="button"
            className="btn btn-ghost !py-1 text-[11px]"
            onClick={onClear}
            disabled={detections.length === 0}
          >
            Clear
          </button>
        </div>
      </header>

      {rows.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-1.5 px-5 py-14 text-center">
          <p className="text-sm font-medium">
            {detections.length === 0 ? "No detections yet" : "Nothing matches that filter"}
          </p>
          <p className="max-w-xs text-xs text-muted">
            {detections.length === 0
              ? "Run an audio fingerprint scan to match the monitored feeds against the catalogue."
              : "Try a different filter or run another scan."}
          </p>
        </div>
      ) : (
        <ol className="max-h-[560px] flex-1 divide-y divide-line/60 overflow-y-auto">
          {rows.map((detection) => {
            const station = stationById(detection.stationId);
            const matched = isMatched(detection);

            return (
              <li key={detection.id} className="animate-rise px-4 py-3 hover:bg-surface-2/40">
                <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span className="font-mono text-[11px] text-muted tabular-nums">
                        {formatClock(detection.detectedAt)}
                      </span>
                      <span className="font-mono text-[10px] text-muted/70">
                        {timeAgo(detection.detectedAt)}
                      </span>
                      <span
                        className={[
                          "rounded border px-1 text-[9px] uppercase tracking-wider",
                          matched
                            ? "border-accent/40 bg-accent/10 text-accent"
                            : "border-red-500/30 bg-red-500/10 text-red-300",
                        ].join(" ")}
                      >
                        {matched ? "matched" : "unmatched"}
                      </span>
                    </div>

                    <p className="mt-1 truncate text-sm font-medium">
                      {detection.track ? detection.track.title : "Unidentified audio"}
                    </p>

                    <p className="truncate text-[11px] text-muted">
                      {detection.stationName}
                      {station && <span className="font-mono"> · {station.frequency}</span>}
                      {detection.track && (
                        <>
                          {" · "}
                          {detection.track.primaryArtist}
                          <span className="font-mono"> · {detection.track.isrc}</span>
                        </>
                      )}
                    </p>

                    <p className="mt-0.5 truncate font-mono text-[10px] text-muted/70">
                      {detection.method} · {detection.matchedSeconds}s window
                    </p>
                  </div>

                  <div className="w-32 shrink-0">
                    <div className="flex items-baseline justify-between">
                      <span className="text-[10px] uppercase tracking-wider text-muted">
                        confidence
                      </span>
                      <span
                        className={[
                          "font-mono text-xs font-semibold tabular-nums",
                          matched ? "text-accent" : "text-red-300",
                        ].join(" ")}
                      >
                        {(detection.confidence * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="relative mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
                      <span
                        className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
                        style={{
                          width: `${Math.min(100, detection.confidence * 100)}%`,
                          background: matched ? "var(--accent)" : "#f87171",
                        }}
                      />
                      {/* Match threshold marker */}
                      <span
                        className="absolute inset-y-0 w-px bg-foreground/50"
                        style={{ left: `${MATCH_THRESHOLD * 100}%` }}
                        title={`Match threshold ${(MATCH_THRESHOLD * 100).toFixed(0)}%`}
                      />
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
