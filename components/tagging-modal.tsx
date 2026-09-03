"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { audioContextAvailable, MonitorFeed } from "@/lib/monitor-audio";
import { formatTimeline, searchCatalogue, type MixSegment } from "@/lib/mix-parser";
import type { Track } from "@/lib/types";

interface TaggingModalProps {
  segment: MixSegment;
  catalogue: Track[];
  onClose: () => void;
  onLink: (segment: MixSegment, track: Track) => void;
}

/** Seconds of the unknown clip the admin gets to listen to. */
const PREVIEW_SEC = 10;

/**
 * Crowdsourced / A&R tagging.
 *
 * An admin listens to a 10-second excerpt of an unidentified segment, searches
 * the metadata catalogue, and links the clip to a recording. Every link is kept
 * with the confidence the parser originally returned, which is what lets the
 * matching model be retrained later.
 *
 * The excerpt is synthesised locally rather than streamed, because there is no
 * real hour-long capture behind the timeline.
 */
export function TaggingModal({ segment, catalogue, onClose, onLink }: TaggingModalProps) {
  const [query, setQuery] = useState("");
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [linked, setLinked] = useState<Track | null>(null);
  const feedRef = useRef<MonitorFeed | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => searchCatalogue(catalogue, query), [catalogue, query]);
  const audioAvailable = audioContextAvailable();

  // Escape closes, and focus lands in the search field.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    searchRef.current?.focus();

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      feedRef.current?.stop();
      feedRef.current = null;
    };
  }, [onClose]);

  async function togglePreview() {
    if (isPreviewing) {
      feedRef.current?.stop();
      feedRef.current = null;
      setIsPreviewing(false);
      return;
    }

    const feed = new MonitorFeed({ volume: 0.5, seed: segment.startSec });
    const started = await feed.start();
    if (!started) return;

    feedRef.current = feed;
    setIsPreviewing(true);

    window.setTimeout(() => {
      feedRef.current?.stop();
      feedRef.current = null;
      setIsPreviewing(false);
    }, PREVIEW_SEC * 1000);
  }

  function handleLink(track: Track) {
    setLinked(track);
    onLink(segment, track);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tagging-modal-heading"
    >
      <div className="panel max-h-[85vh] w-full max-w-2xl overflow-y-auto p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="tagging-modal-heading" className="text-sm font-semibold tracking-tight">
              Tag unidentified audio
            </h2>
            <p className="mt-1 text-xs text-muted">
              Segment {formatTimeline(segment.startSec)}–{formatTimeline(segment.endSec)} ·{" "}
              {segment.confidence !== null
                ? `${Math.round(segment.confidence * 100)}% parser confidence`
                : "no confident match"}
            </p>
          </div>
          <button type="button" className="btn btn-ghost" onClick={onClose} aria-label="Close tagging">
            Close
          </button>
        </div>

        {/* 10-second excerpt */}
        <div className="mt-4 rounded-lg border border-line bg-surface-2 p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-medium">10-second excerpt</p>
              <p className="mt-0.5 text-[11px] text-muted">
                {audioAvailable
                  ? "Synthesised locally — there is no captured stream behind the timeline yet."
                  : "Audio playback is unavailable in this browser."}
              </p>
            </div>
            <button
              type="button"
              className={isPreviewing ? "btn" : "btn btn-primary"}
              onClick={() => void togglePreview()}
              disabled={!audioAvailable}
              aria-pressed={isPreviewing}
            >
              {isPreviewing ? "Stop excerpt" : "Play excerpt"}
            </button>
          </div>
        </div>

        {/* Catalogue search */}
        <label className="field mt-4">
          <span className="label">Search the metadata catalogue</span>
          <input
            ref={searchRef}
            className="field"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Title, artist or ISRC"
            aria-describedby="tagging-results-hint"
          />
        </label>

        <p id="tagging-results-hint" className="mt-1 text-[11px] text-muted">
          {query.trim() === ""
            ? "Type at least two characters to search."
            : `${results.length} match${results.length === 1 ? "" : "es"}.`}
        </p>

        {results.length > 0 ? (
          <ul className="mt-3 space-y-1.5">
            {results.map((track) => (
              <li
                key={track.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface-2 p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{track.title}</p>
                  <p className="truncate text-xs text-muted">
                    {track.primaryArtist}
                    {track.featuredArtists.length > 0
                      ? ` ft ${track.featuredArtists.join(", ")}`
                      : ""}{" "}
                    · <span className="font-mono">{track.isrc}</span>
                    {track.genre ? ` · ${track.genre}` : ""}
                  </p>
                </div>
                <button type="button" className="btn btn-primary" onClick={() => handleLink(track)}>
                  Link to this artist
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {linked ? (
          <p role="status" className="mt-4 rounded border border-line bg-surface-2 px-3 py-2 text-xs text-accent">
            Linked to “{linked.title}” by {linked.primaryArtist}. The clip will count as matched from
            the next scan, and the prior {segment.confidence !== null ? `${Math.round(segment.confidence * 100)}%` : "absent"}{" "}
            confidence is recorded for model retraining.
          </p>
        ) : null}
      </div>
    </div>
  );
}
