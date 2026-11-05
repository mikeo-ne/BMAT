"""Reference fingerprint index (SQLite) and matcher.

The index holds landmark hashes for every enrolled master recording. It lives
next to the worker (fast local lookups) and is rebuilt from masters on demand.
"""
from __future__ import annotations

import sqlite3
import threading
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from .fingerprint import Landmarks, frames_to_seconds

MIN_ALIGNED = 18  # hashes that must agree on one offset to count as a match
MIN_MARGIN = 2.0  # best score must be this many times the background
# Chance agreement grows with the number of hashes compared, so long/dense
# windows need proportionally more agreeing hashes (fraction of the query).
MIN_RATIO = 0.012


@dataclass
class Track:
    id: int
    recording_id: str | None
    title: str
    artist: str
    isrc: str | None
    duration_sec: float


@dataclass
class Match:
    track: Track
    score: int  # aligned hashes
    query_hashes: int
    track_offset_sec: float  # where in the master the query window starts
    background: int = 0  # best chance alignment seen (other offsets / other songs)

    @property
    def confidence(self) -> float:
        """Match strength 50–99.9: 50 at the acceptance threshold, ~95 by ~3× it.
        A heuristic for ranking evidence, not a calibrated probability."""
        import math

        bar = max(MIN_ALIGNED, MIN_MARGIN * max(self.background, 1))
        return round(min(99.9, 50 + 50 * (1 - math.exp(-max(0.0, self.score - bar) / 15))), 1)


class FingerprintIndex:
    def __init__(self, path: str | Path):
        self.path = str(path)
        self._lock = threading.Lock()
        self._db = sqlite3.connect(self.path, check_same_thread=False)
        self._db.executescript(
            """
            pragma journal_mode = wal;
            create table if not exists tracks (
              id integer primary key,
              recording_id text unique,
              title text not null,
              artist text not null,
              isrc text,
              duration_sec real not null
            );
            create table if not exists hashes (
              hash integer not null,
              track_id integer not null references tracks(id) on delete cascade,
              t integer not null
            );
            create index if not exists hashes_hash on hashes(hash);
            """
        )
        self._tracks: dict[int, Track] = {}
        self._load_tracks()

    def _load_tracks(self) -> None:
        rows = self._db.execute("select id, recording_id, title, artist, isrc, duration_sec from tracks").fetchall()
        self._tracks = {r[0]: Track(*r) for r in rows}

    @property
    def tracks(self) -> list[Track]:
        return list(self._tracks.values())

    def enroll(self, lm: Landmarks, *, title: str, artist: str, duration_sec: float,
               recording_id: str | None = None, isrc: str | None = None) -> Track:
        with self._lock, self._db:
            if recording_id:
                old = self._db.execute("select id from tracks where recording_id = ?", (recording_id,)).fetchone()
                if old:
                    self._db.execute("delete from hashes where track_id = ?", (old[0],))
                    self._db.execute("delete from tracks where id = ?", (old[0],))
            cur = self._db.execute(
                "insert into tracks (recording_id, title, artist, isrc, duration_sec) values (?, ?, ?, ?, ?)",
                (recording_id, title, artist, isrc, duration_sec),
            )
            tid = int(cur.lastrowid)
            self._db.executemany(
                "insert into hashes (hash, track_id, t) values (?, ?, ?)",
                zip(lm.hashes.tolist(), [tid] * lm.hashes.size, lm.offsets.tolist()),
            )
        self._load_tracks()
        return self._tracks[tid]

    def match(self, lm: Landmarks) -> Match | None:
        if lm.hashes.size == 0 or not self._tracks:
            return None
        uniq = np.unique(lm.hashes)
        # Query offsets per hash (a hash can occur more than once in the window).
        q_by_hash: dict[int, list[int]] = {}
        for h, o in zip(lm.hashes.tolist(), lm.offsets.tolist()):
            q_by_hash.setdefault(h, []).append(o)

        votes: dict[tuple[int, int], int] = {}
        with self._lock:
            for i in range(0, uniq.size, 900):
                chunk = uniq[i : i + 900].tolist()
                q = f"select hash, track_id, t from hashes where hash in ({','.join('?' * len(chunk))})"
                for h, tid, t in self._db.execute(q, chunk):
                    for qo in q_by_hash.get(h, ()):
                        key = (tid, t - qo)
                        votes[key] = votes.get(key, 0) + 1
        if not votes:
            return None

        # Best offset per track, tolerating ±1 frame of jitter.
        best_per_track: dict[int, tuple[int, int]] = {}
        for (tid, off), n in votes.items():
            n3 = n + votes.get((tid, off - 1), 0) + votes.get((tid, off + 1), 0)
            if n3 > best_per_track.get(tid, (0, 0))[0]:
                best_per_track[tid] = (n3, off)
        ranked = sorted(best_per_track.items(), key=lambda kv: kv[1][0], reverse=True)
        tid, (score, off) = ranked[0]
        # Background = the best other song. (The same song at another offset is not
        # background: choruses repeat. Chance agreement on a one-song catalogue is
        # handled by the detector, which needs the song to stay on its own timeline.)
        background = ranked[1][1][0] if len(ranked) > 1 else 0
        need = max(MIN_ALIGNED, MIN_MARGIN * max(background, 1), MIN_RATIO * lm.hashes.size)
        if score < need:
            return None
        # Negative offset = the window started before the song did (song begins inside the window).
        return Match(self._tracks[tid], score, int(lm.hashes.size), frames_to_seconds(off), background)

    def close(self) -> None:
        self._db.close()
