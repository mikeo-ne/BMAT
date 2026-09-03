"use client";

import {
  CONFIDENCE_FLOOR,
  formatTimeline,
  type ManualLink,
  type MixSegment,
} from "@/lib/mix-parser";

interface UnidentifiedQueueProps {
  segments: MixSegment[];
  links: ManualLink[];
  onTag: (segment: MixSegment) => void;
  onSeek: (second: number) => void;
}

/**
 * Audio the parser could not name.
 *
 * Everything under `CONFIDENCE_FLOOR` lands here rather than being dropped — an
 * unidentified play is a royalty that nobody is being paid for, so the queue is
 * the work list, not a diagnostics dump.
 */
export function UnidentifiedQueue({ segments, links, onTag, onSeek }: UnidentifiedQueueProps) {
  const linkedIds = new Set(links.map((l) => l.segmentId));
  const outstanding = segments.filter((s) => !linkedIds.has(s.id));

  return (
    <section className="panel p-4" aria-labelledby="unidentified-heading">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="unidentified-heading" className="text-sm font-semibold tracking-tight">
            Unidentified segments
          </h2>
          <p className="mt-1 text-xs text-muted">
            {segments.length} below {Math.round(CONFIDENCE_FLOOR * 100)}% confidence ·{" "}
            {segments.length - outstanding.length} resolved this session
          </p>
        </div>
      </div>

      {segments.length === 0 ? (
        <p className="mt-4 rounded border border-dashed border-line px-4 py-8 text-center text-xs text-muted">
          Every segment in this hour was matched confidently.
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {segments.map((segment) => {
            const link = links.find((l) => l.segmentId === segment.id);
            const confidencePct = Math.round((segment.confidence ?? 0) * 100);

            return (
              <li
                key={segment.id}
                className="rounded-lg border border-line bg-surface-2 p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-xs text-muted">
                      {formatTimeline(segment.startSec)} – {formatTimeline(segment.endSec)} ·{" "}
                      {Math.round(segment.endSec - segment.startSec)}s
                    </p>
                    <p className="mt-0.5 text-sm font-medium">
                      {link ? `${link.title} — ${link.artist}` : "Unknown audio"}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="w-28" title={`${confidencePct}% parser confidence`}>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${confidencePct}%`,
                            background:
                              confidencePct < 35 ? "#f0544f" : "var(--brand)",
                          }}
                        />
                      </div>
                      <span className="mt-1 block font-mono text-[10px] text-muted">
                        {confidencePct}% confidence
                      </span>
                    </div>

                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => onSeek(segment.startSec)}
                    >
                      Seek
                    </button>
                    <button
                      type="button"
                      className={link ? "btn" : "btn btn-primary"}
                      onClick={() => onTag(segment)}
                    >
                      {link ? "Re-tag" : "Tag clip"}
                    </button>
                  </div>
                </div>

                {link ? (
                  <p className="mt-2 text-[11px] text-accent">
                    Linked by {link.linkedBy} · <span className="font-mono">{link.isrc}</span> ·
                    parser had {link.priorConfidence !== null ? `${Math.round(link.priorConfidence * 100)}%` : "no match"}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
