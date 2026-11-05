"""Turns a stream of per-window matches into airplay detections (one per play).

A play only counts when the song keeps matching *on its own timeline*: each
new window must land at the position in the master that the clock predicts
(10 s later on air = 10 s further into the song, ±`DRIFT_SEC`). Windows that
match the song at an unrelated position are ignored — that is what a shared
beat, a jingle built from the song, or chance agreement looks like. A play needs
`confirm_hits` such windows spanning `min_detection_sec` of air time, and closes
after `end_gap_sec` without a consistent match. Back-to-back replays are split
when the position jumps backwards.
"""
from __future__ import annotations

import datetime as dt
from dataclasses import dataclass, field

import numpy as np

from .config import Settings, Station
from .fingerprint import landmarks
from .index import FingerprintIndex, Match, Track

DRIFT_SEC = 2.0  # allowed slip between air time and song position (stream jitter, DJ pitch)


@dataclass
class Detection:
    station: Station
    track: Track
    started_at: dt.datetime
    ended_at: dt.datetime
    score: int
    confidence: float
    track_offset_sec: float
    evidence: np.ndarray  # best-matching 10 s window (float mono, 11.025 kHz)

    @property
    def duration_sec(self) -> int:
        return int(round((self.ended_at - self.started_at).total_seconds()))


@dataclass
class Unmatched:
    station: Station
    heard_at: dt.datetime
    rms: float
    audio: np.ndarray


@dataclass
class _Open:
    match: Match
    first_seen: float
    last_seen: float
    last_offset: float
    hits: int = 1
    best_score: int = 0
    first_offset: float = 0.0
    anchor_t: float = 0.0  # air time (window start) of the first window
    covered_until: float = 0.0  # end of the last consistent window (air time)
    evidence: np.ndarray = field(default_factory=lambda: np.empty(0, np.float32))


class Detector:
    def __init__(self, station: Station, index: FingerprintIndex, settings: Settings):
        self.station = station
        self.index = index
        self.s = settings
        self.cur: _Open | None = None
        self.last_unmatched = -1e9
        self.now_playing: Track | None = None
        self.matching = False  # did the latest window match a catalogue song?

    def _ts(self, base: dt.datetime, t: float) -> dt.datetime:
        return base + dt.timedelta(seconds=t)

    def step(self, window: np.ndarray, t_end: float, base: dt.datetime) -> list[Detection | Unmatched]:
        """Analyse one window ending at stream-time `t_end` seconds after `base`."""
        out: list[Detection | Unmatched] = []
        t_start = t_end - window.size / 11025.0
        m = self.index.match(landmarks(window))
        self.matching = m is not None

        if m:
            c = self.cur
            same = c is not None and c.match.track.id == m.track.id
            on_timeline = same and abs((m.track_offset_sec - c.first_offset) - (t_start - c.anchor_t)) <= DRIFT_SEC
            replay = same and m.track_offset_sec + 20 < c.last_offset  # position jumped back → new play
            if on_timeline:
                c.hits += 1
                # Song end = this window's start + what remains of the master after this position,
                # capped at the window end (the song may have been faded out early).
                remaining = c.match.track.duration_sec - m.track_offset_sec
                c.last_seen = min(t_end, t_start + max(0.0, remaining))
                c.covered_until = t_end
                c.last_offset = m.track_offset_sec
                if m.score > c.best_score:
                    c.best_score, c.evidence, c.match = m.score, window.copy(), m
            elif same and not replay and c.hits >= self.s.confirm_hits:
                pass  # confirmed play; an off-timeline window (talk-over, effect) doesn't end it
            else:
                out += self._close(base)
                # If the window caught the song's opening, back-date the start to the exact first second.
                off = m.track_offset_sec
                start = t_start - off if -self.s.window_sec <= off <= self.s.window_sec else t_start
                self.cur = _Open(match=m, first_seen=start, last_seen=t_end, last_offset=off, hits=1,
                                 best_score=m.score, first_offset=off, anchor_t=t_start, covered_until=t_end,
                                 evidence=window.copy())
            self.matching = self.cur is not None and self.cur.hits >= self.s.confirm_hits
            if self.matching:
                self.now_playing = self.cur.match.track
        else:
            if self.cur and t_end - self.cur.last_seen > self.s.end_gap_sec:
                out += self._close(base)
            if self.cur is None:
                rms = float(np.sqrt(np.mean(window**2))) if window.size else 0.0
                if rms > 0.02 and t_end - self.last_unmatched >= self.s.unmatched_every_sec:
                    self.last_unmatched = t_end
                    out.append(Unmatched(self.station, self._ts(base, t_start), rms, window.copy()))
        return out

    def _close(self, base: dt.datetime) -> list[Detection]:
        c, self.cur = self.cur, None
        self.now_playing = None
        # The span the matcher actually confirmed (not the back-dated start) must be long enough.
        if not c or c.hits < self.s.confirm_hits or c.covered_until - (c.anchor_t + self.s.window_sec) < self.s.min_detection_sec - self.s.window_sec:
            return []
        first_offset = c.first_offset if c.first_offset > self.s.window_sec else 0.0
        return [Detection(
            station=self.station,
            track=c.match.track,
            started_at=self._ts(base, c.first_seen),
            ended_at=self._ts(base, c.last_seen),
            score=c.best_score,
            confidence=c.match.confidence,
            track_offset_sec=round(first_offset, 1),
            evidence=c.evidence,
        )]

    def flush(self, base: dt.datetime) -> list[Detection]:
        return self._close(base)
