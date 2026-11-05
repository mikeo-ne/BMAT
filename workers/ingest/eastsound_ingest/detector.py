"""Turns a stream of per-window matches into airplay detections (one per play).

A play is opened after `confirm_hits` consecutive matching windows (cuts false
blips), extended while the same recording keeps matching, and closed after
`end_gap_sec` of silence from the matcher. Back-to-back replays of the same
song are split when the position inside the master jumps backwards.
"""
from __future__ import annotations

import datetime as dt
from dataclasses import dataclass, field

import numpy as np

from .config import Settings, Station
from .fingerprint import landmarks
from .index import FingerprintIndex, Match, Track


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
            replay = same and m.track_offset_sec + 20 < c.last_offset  # position jumped back → new play
            if same and not replay:
                c.hits += 1
                # Song end = this window's start + what remains of the master after this position,
                # capped at the window end (the song may have been faded out early).
                remaining = c.match.track.duration_sec - m.track_offset_sec
                c.last_seen = min(t_end, t_start + max(0.0, remaining))
                c.last_offset = m.track_offset_sec
                if m.score > c.best_score:
                    c.best_score, c.evidence, c.match = m.score, window.copy(), m
            else:
                out += self._close(base)
                # If the window caught the song's opening, back-date the start to the exact first second.
                off = m.track_offset_sec
                start = t_start - off if -self.s.window_sec <= off <= self.s.window_sec else t_start
                self.cur = _Open(match=m, first_seen=start, last_seen=t_end, last_offset=m.track_offset_sec,
                                 hits=1, best_score=m.score, first_offset=m.track_offset_sec, evidence=window.copy())
            if self.cur and self.cur.hits >= self.s.confirm_hits:
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
        if not c or c.hits < self.s.confirm_hits or c.last_seen - c.first_seen < self.s.min_detection_sec:
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
