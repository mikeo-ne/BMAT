"use client";

import { useCallback, useMemo, useState } from "react";

import { MixTimeline } from "@/components/mix-timeline";
import { TaggingModal } from "@/components/tagging-modal";
import { UnidentifiedQueue } from "@/components/unidentified-queue";
import {
  buildMixTimeline,
  buildMixWaveform,
  buildTransitions,
  buildUnidentifiedQueue,
  formatTimeline,
  type ManualLink,
  type MixSegment,
} from "@/lib/mix-parser";
import { MONITORED_STATIONS } from "@/lib/monitoring";
import type { Track } from "@/lib/types";

interface MixParserViewProps {
  catalogue: Track[];
}

const ADMIN_NAME = "A&R Desk";

export function MixParserView({ catalogue }: MixParserViewProps) {
  const [stationId, setStationId] = useState(MONITORED_STATIONS[0]?.id ?? "capital-kla");
  const [currentSecond, setCurrentSecond] = useState(0);
  const [tagging, setTagging] = useState<MixSegment | null>(null);
  const [links, setLinks] = useState<ManualLink[]>([]);

  const segments = useMemo(
    () => buildMixTimeline(stationId, catalogue),
    [stationId, catalogue],
  );
  const waveform = useMemo(() => buildMixWaveform(segments), [segments]);
  const transitions = useMemo(() => buildTransitions(segments), [segments]);
  const unidentified = useMemo(() => buildUnidentifiedQueue(segments), [segments]);

  const station = MONITORED_STATIONS.find((s) => s.id === stationId) ?? MONITORED_STATIONS[0];

  const currentSegment = useMemo(
    () =>
      segments.find((s) => currentSecond >= s.startSec && currentSecond < s.endSec) ??
      segments[segments.length - 1] ??
      null,
    [segments, currentSecond],
  );

  const handleSeek = useCallback((second: number) => setCurrentSecond(second), []);

  function handleLink(segment: MixSegment, track: Track) {
    const link: ManualLink = {
      segmentId: segment.id,
      trackId: track.id,
      title: track.title,
      artist: track.primaryArtist,
      isrc: track.isrc,
      linkedBy: ADMIN_NAME,
      linkedAt: new Date().toISOString(),
      priorConfidence: segment.confidence,
    };

    setLinks((prev) => [...prev.filter((l) => l.segmentId !== segment.id), link]);
  }

  return (
    <div className="flex flex-col gap-4 pb-8">
      <section className="panel flex flex-wrap items-center justify-between gap-4 p-4">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">Capture source</h2>
          <p className="mt-1 text-xs text-muted">
            One continuous hour per station, parsed into segments and run through the fingerprint
            matcher.
          </p>
        </div>

        <label className="field">
          <span className="label">Station</span>
          <select
            className="field"
            value={stationId}
            onChange={(e) => {
              setStationId(e.target.value);
              setCurrentSecond(0);
            }}
          >
            {MONITORED_STATIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name} · {option.frequency} · {option.location}
              </option>
            ))}
          </select>
        </label>
      </section>

      <MixTimeline
        segments={segments}
        waveform={waveform}
        stationName={station ? `${station.name} (${station.frequency} ${station.location})` : "Station"}
        onSeek={handleSeek}
        currentSegment={currentSegment}
        currentSecond={currentSecond}
      />

      <section className="panel p-4" aria-labelledby="transitions-heading">
        <h2 id="transitions-heading" className="text-sm font-semibold tracking-tight">
          Auto-detected track transitions
        </h2>
        <p className="mt-1 text-xs text-muted">
          {transitions.length} hand-overs in the hour. A gap over a few seconds is dead air worth
          raising with the station.
        </p>

        <ol className="mt-4 grid grid-cols-1 gap-2 lg:grid-cols-2">
          {transitions.map((transition, i) => (
            <li
              key={`${transition.atSec}-${i}`}
              className="rounded-lg border border-line bg-surface-2 p-3 text-xs"
            >
              <div className="flex items-baseline justify-between gap-2">
                <button
                  type="button"
                  className="btn btn-ghost font-mono"
                  onClick={() => handleSeek(Math.max(transition.atSec - 2, 0))}
                >
                  {formatTimeline(transition.atSec)}
                </button>
                {transition.gapSec > 3 ? (
                  <span className="chip text-brand">{transition.gapSec}s dead air</span>
                ) : null}
              </div>

              <p className="mt-1.5 text-muted">
                <span className="text-foreground">
                  {transition.from.title ?? "Unknown audio"}
                </span>{" "}
                ends
              </p>
              <p className="text-muted">
                <span className="text-foreground">{transition.to.title ?? "Unknown audio"}</span>{" "}
                starts{transition.to.artist ? ` — ${transition.to.artist}` : ""}
              </p>
            </li>
          ))}
        </ol>
      </section>

      <UnidentifiedQueue
        segments={unidentified}
        links={links}
        onTag={setTagging}
        onSeek={handleSeek}
      />

      {tagging ? (
        <TaggingModal
          segment={tagging}
          catalogue={catalogue}
          onClose={() => setTagging(null)}
          onLink={handleLink}
        />
      ) : null}

      <p className="pb-2 text-center text-[11px] text-muted">
        The hour is generated deterministically per station and the excerpt audio is synthesised
        locally. No live broadcast capture or reference index is wired up in this prototype.
      </p>
    </div>
  );
}
