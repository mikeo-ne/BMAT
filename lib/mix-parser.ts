import { createRandom, hashSeed } from "@/lib/airplay";
import type { Track } from "@/lib/types";

/** One hour of continuous station audio. */
export const MIX_DURATION_SEC = 3_600;

/** Below this the parser refuses to name a segment. */
export const CONFIDENCE_FLOOR = 0.6;

export type SegmentKind = "track" | "unidentified" | "speech" | "ad-break";

export interface MixSegment {
  id: string;
  startSec: number;
  endSec: number;
  kind: SegmentKind;
  /** Only present when the parser named the segment. */
  title: string | null;
  artist: string | null;
  isrc: string | null;
  /** 0-1 parser confidence; null for non-music segments. */
  confidence: number | null;
  /** Peak amplitude 0-1, for drawing the waveform block. */
  peak: number;
}

export interface TrackTransition {
  /** Second the previous item ended. */
  atSec: number;
  from: MixSegment;
  to: MixSegment;
  /** Gap in seconds; 0 means a clean crossfade, >0 means dead air. */
  gapSec: number;
}

/* -------------------------------------------------------------------------- */
/* Timeline                                                                    */
/* -------------------------------------------------------------------------- */

const KIND_LABEL: Record<SegmentKind, string> = {
  track: "Matched track",
  unidentified: "Unidentified audio",
  speech: "DJ / news",
  "ad-break": "Ad break",
};

export function segmentLabel(segment: MixSegment): string {
  if (segment.title) return segment.title;
  return KIND_LABEL[segment.kind];
}

/**
 * Cut an hour of station audio into segments and run the (simulated) parser
 * over each one.
 *
 * Deterministic on `seedKey`, so a station's hour always parses identically.
 * Roughly one segment in six comes back below `CONFIDENCE_FLOOR` — those are the
 * queue an A&R admin works through.
 */
export function buildMixTimeline(seedKey: string, catalogue: Track[]): MixSegment[] {
  const rand = createRandom(hashSeed(`mix:${seedKey}`));
  const segments: MixSegment[] = [];

  let cursor = 0;
  let index = 0;

  while (cursor < MIX_DURATION_SEC) {
    const roll = rand();

    let kind: SegmentKind;
    let duration: number;

    if (roll < 0.58) {
      kind = "track";
      duration = 150 + Math.floor(rand() * 120); // 2:30 - 4:30
    } else if (roll < 0.78) {
      kind = "unidentified";
      duration = 60 + Math.floor(rand() * 90); // 1:00 - 2:30
    } else if (roll < 0.9) {
      kind = "speech";
      duration = 40 + Math.floor(rand() * 80); // 0:40 - 2:00
    } else {
      kind = "ad-break";
      duration = 90 + Math.floor(rand() * 90); // 1:30 - 3:00
    }

    const endSec = Math.min(cursor + duration, MIX_DURATION_SEC);
    const track = catalogue[index % Math.max(catalogue.length, 1)];

    const named = kind === "track";
    // Matched tracks land high; unidentified ones deliberately land under the floor.
    const confidence = named ? 0.64 + rand() * 0.35 : kind === "unidentified" ? 0.18 + rand() * 0.4 : null;

    segments.push({
      id: `${seedKey}-seg-${index}`,
      startSec: cursor,
      endSec,
      kind,
      title: named && track ? track.title : null,
      artist: named && track ? track.primaryArtist : null,
      isrc: named && track ? track.isrc : null,
      confidence,
      peak: kind === "ad-break" ? 0.45 + rand() * 0.2 : 0.62 + rand() * 0.38,
    });

    cursor = endSec;
    index += 1;
  }

  return segments;
}

/* -------------------------------------------------------------------------- */
/* Transitions                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Every hand-over between two music segments.
 *
 * A gap of 0 is a clean crossfade; anything over a couple of seconds is dead air
 * worth flagging to the station.
 */
export function buildTransitions(segments: MixSegment[]): TrackTransition[] {
  const music = segments.filter((s) => s.kind === "track" || s.kind === "unidentified");
  const transitions: TrackTransition[] = [];

  for (let i = 1; i < music.length; i++) {
    const from = music[i - 1];
    const to = music[i];
    transitions.push({
      atSec: from.endSec,
      from,
      to,
      gapSec: Math.max(to.startSec - from.endSec, 0),
    });
  }

  return transitions;
}

/** Segments the parser could not name confidently, earliest first. */
export function buildUnidentifiedQueue(segments: MixSegment[]): MixSegment[] {
  return segments.filter(
    (s) => s.kind === "unidentified" || (s.confidence !== null && s.confidence < CONFIDENCE_FLOOR),
  );
}

/** Manual link recorded by an admin against an unidentified segment. */
export interface ManualLink {
  segmentId: string;
  trackId: string;
  title: string;
  artist: string;
  isrc: string;
  linkedBy: string;
  linkedAt: string;
  /** Confidence the parser originally returned, kept to measure improvement. */
  priorConfidence: number | null;
}

/* -------------------------------------------------------------------------- */
/* Waveform                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Amplitude envelope for the hour, one sample per `stepSec` seconds.
 *
 * Music blocks are loud and busy, speech blocks sit lower with more dynamic
 * range, and ad breaks are compressed and flat — which is what makes the
 * transitions readable at a glance.
 */
export function buildMixWaveform(segments: MixSegment[], stepSec = 2): number[] {
  const rand = createRandom(hashSeed(`wave:${segments.length}:${segments[0]?.id ?? "empty"}`));
  const samples = Math.ceil(MIX_DURATION_SEC / stepSec);
  const values: number[] = [];

  for (let i = 0; i < samples; i++) {
    const at = i * stepSec;
    const segment =
      segments.find((s) => at >= s.startSec && at < s.endSec) ?? segments[segments.length - 1];

    if (!segment) {
      values.push(0);
      continue;
    }

    // Attack and release at each segment edge so blocks read as separate items.
    const inPoint = (at - segment.startSec) / Math.max(segment.endSec - segment.startSec, 1);
    const edge = Math.min(inPoint * 8, (1 - inPoint) * 8, 1);

    const base =
      segment.kind === "speech"
        ? 0.24 + rand() * 0.3
        : segment.kind === "ad-break"
          ? 0.55 + rand() * 0.12
          : segment.peak * (0.55 + rand() * 0.45);

    values.push(Math.max(0.02, Math.min(1, base * (0.35 + edge * 0.65))));
  }

  return values;
}

/** Seconds formatted as `MM:SS`, past an hour as `H:MM:SS`. */
export function formatTimeline(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Search the catalogue the way the tagging modal does — title, artist or ISRC. */
export function searchCatalogue(catalogue: Track[], query: string): Track[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  return catalogue
    .filter((track) => {
      const hay = [track.title, track.primaryArtist, ...track.featuredArtists, track.isrc]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    })
    .slice(0, 8);
}
