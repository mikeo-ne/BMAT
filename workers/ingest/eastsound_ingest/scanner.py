"""Brand-mention scanning on live streams.

Per station, audio that is NOT part of a matched song (talk, live reads,
unknown audio) is gathered into ~15 s chunks with a 2 s overlap, so a brand
said across a boundary isn't cut in half. Chunks go to one shared
speech-to-text pool. If the CPU can't keep up, the oldest work is skipped and
counted rather than letting a backlog grow without limit.
"""
from __future__ import annotations

import datetime as dt
import logging
import queue
import threading
import time
from dataclasses import dataclass
from typing import Callable

import numpy as np

from .config import Station
from .fingerprint import SAMPLE_RATE
from .mentions import KeywordSet, find_mentions
from .speech import Transcriber

log = logging.getLogger(__name__)


@dataclass
class Mention:
    station: Station
    heard_at: dt.datetime
    brand: str
    keyword_id: str | None
    term: str
    heard: str
    score: int
    transcript: str
    audio: np.ndarray


class KeywordSource:
    """Keyword list refreshed in the background (the CMO can edit it while we run)."""

    def __init__(self, loader: Callable[[], KeywordSet], refresh_sec: float = 600):
        self._loader, self._refresh = loader, refresh_sec
        self._lock = threading.Lock()
        self._kw = KeywordSet()
        self._at = -1e9

    def get(self) -> KeywordSet:
        with self._lock:
            if time.monotonic() - self._at >= self._refresh:
                try:
                    self._kw = self._loader()
                    log.info("tracking %d brands for mentions", len(self._kw))
                except Exception as e:  # keep the previous list on failure
                    log.warning("could not refresh tracked brands: %s", e)
                self._at = time.monotonic()
            return self._kw


class SpeechPool:
    """Shared transcription workers with a bounded backlog."""

    def __init__(self, transcriber: Transcriber, workers: int = 1, max_pending: int = 6):
        self.transcriber = transcriber
        self.q: queue.Queue = queue.Queue(maxsize=max_pending)
        self.lock = threading.Lock()
        self.transcribed = self.skipped = 0
        self.audio_sec = self.cpu_sec = 0.0
        self._threads = [threading.Thread(target=self._run, name=f"asr-{i}", daemon=True) for i in range(max(1, workers))]
        for t in self._threads:
            t.start()

    def submit(self, job: Callable[[Transcriber], None]) -> bool:
        try:
            self.q.put_nowait(job)
            return True
        except queue.Full:
            try:  # drop the OLDEST pending chunk, keep the newest
                self.q.get_nowait()
                self.q.task_done()
                self.q.put_nowait(job)
            except (queue.Empty, queue.Full):
                pass
            with self.lock:
                self.skipped += 1
            return False

    def _run(self) -> None:
        while True:
            job = self.q.get()
            if job is None:
                self.q.task_done()
                return
            try:
                job(self.transcriber)
            except Exception:
                log.exception("speech job failed")
            finally:
                self.q.task_done()

    def record(self, audio_sec: float, cpu_sec: float) -> None:
        with self.lock:
            self.transcribed += 1
            self.audio_sec += audio_sec
            self.cpu_sec += cpu_sec

    def summary(self) -> str:
        with self.lock:
            speed = self.audio_sec / self.cpu_sec if self.cpu_sec else 0
            return f"speech: {self.transcribed} chunks, {speed:.1f}× real time, {self.skipped} skipped (CPU busy)"

    def wait_idle(self, timeout: float = 600) -> bool:
        """Block until every queued chunk has been transcribed (file scans, tests)."""
        done = threading.Event()
        threading.Thread(target=lambda: (self.q.join(), done.set()), daemon=True).start()
        return done.wait(timeout)

    def close(self) -> None:
        for _ in self._threads:
            self.q.put(None)


class MentionScanner:
    def __init__(self, station: Station, pool: SpeechPool, keywords: KeywordSource,
                 emit: Callable[[Mention], None], chunk_sec: float = 15.0, overlap_sec: float = 2.0,
                 cooldown_sec: float = 45.0, min_rms: float = 0.01, lookback_sec: float = 12.0):
        self.station, self.pool, self.keywords, self.emit = station, pool, keywords, emit
        self.chunk_n = int(chunk_sec * SAMPLE_RATE)
        self.overlap_n = int(overlap_sec * SAMPLE_RATE)
        self.cooldown = dt.timedelta(seconds=cooldown_sec)
        self.min_rms = min_rms
        self.buf = np.zeros(0, np.float32)
        self.buf_start = 0.0  # stream seconds where buf begins
        # The fingerprint matcher looks at 10 s windows, so it keeps reporting "song"
        # for up to ~10 s after the song has ended. When matching stops (or the stream
        # ends mid-lag), look back this far so a read right after the song is not lost.
        self.lookback_n = int(lookback_sec * SAMPLE_RATE)
        self.recent = np.zeros(0, np.float32)
        self.was_music = False
        self.t_end = 0.0
        self.last_hit: dict[str, dt.datetime] = {}
        self.lock = threading.Lock()
        self.mentions = 0

    def feed(self, chunk: np.ndarray, t_end: float, base: dt.datetime, in_music: bool) -> None:
        """`chunk` ends at stream time `t_end` (s). `in_music`: a catalogue song is matching."""
        self.recent = np.concatenate([self.recent, chunk])[-(self.lookback_n + chunk.size):]
        self.t_end = t_end
        if in_music:
            if self.buf.size >= 3 * SAMPLE_RATE:
                self._flush(base)
            self.buf = np.zeros(0, np.float32)
            self.was_music = True
            return
        if self.was_music:  # song just stopped matching: include the tail it was still covering
            self.was_music = False
            self.buf = self.recent[: -chunk.size][-self.lookback_n:].copy() if self.recent.size > chunk.size else np.zeros(0, np.float32)
            self.buf_start = t_end - (self.buf.size + chunk.size) / SAMPLE_RATE
        elif self.buf.size == 0:
            self.buf_start = t_end - chunk.size / SAMPLE_RATE
        self.buf = np.concatenate([self.buf, chunk])
        if self.buf.size >= self.chunk_n:
            self._flush(base)
            keep = self.buf[-self.overlap_n:] if self.overlap_n else np.zeros(0, np.float32)
            self.buf_start = t_end - keep.size / SAMPLE_RATE
            self.buf = keep.copy()

    def flush(self, base: dt.datetime, t_end: float | None = None) -> None:
        """End of stream. If the song was still 'matching', its last seconds may be talk."""
        if self.was_music and t_end is not None and self.recent.size >= 3 * SAMPLE_RATE:
            self.buf = self.recent[-self.lookback_n:].copy()
            self.buf_start = t_end - self.buf.size / SAMPLE_RATE
            self.was_music = False
        if self.buf.size >= 3 * SAMPLE_RATE:
            self._flush(base)
        self.buf = np.zeros(0, np.float32)

    def _flush(self, base: dt.datetime) -> None:
        audio = self.buf.copy()
        if float(np.sqrt(np.mean(audio**2))) < self.min_rms:
            log.debug("[%s] skip %.1fs of near-silence", self.station.slug, audio.size / SAMPLE_RATE)
            return  # silence / dead air
        heard_at = base + dt.timedelta(seconds=self.buf_start)
        log.debug("[%s] queue %.1fs of speech from %s", self.station.slug, audio.size / SAMPLE_RATE, heard_at.strftime("%H:%M:%S"))
        kws = self.keywords.get()
        if not len(kws):
            return
        self.pool.submit(lambda tr: self._job(tr, audio, heard_at, kws))

    def _job(self, tr: Transcriber, audio: np.ndarray, heard_at: dt.datetime, kws: KeywordSet) -> None:
        t0 = time.monotonic()
        text = tr.transcribe(audio)
        self.pool.record(audio.size / SAMPLE_RATE, time.monotonic() - t0)
        log.debug("[%s] heard at %s: %s", self.station.slug, heard_at.strftime("%H:%M:%S"), text)
        if not text:
            return
        ids = {k.brand: k.id for k in kws.keywords}
        for hit in find_mentions(text, kws):
            with self.lock:
                last = self.last_hit.get(hit.brand)
                if last and heard_at - last < self.cooldown:
                    continue  # same brand, same read, already reported
                self.last_hit[hit.brand] = heard_at
                self.mentions += 1
            log.info("[%s] 🗣 %s (heard %r, score %d)", self.station.slug, hit.brand, hit.heard, hit.score)
            self.emit(Mention(self.station, heard_at, hit.brand, ids.get(hit.brand), hit.term, hit.heard,
                              hit.score, text[:1000], audio))
