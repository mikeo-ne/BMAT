"""One thread per station: pull the stream with ffmpeg, feed the detector, report health."""
from __future__ import annotations

import datetime as dt
import logging
import subprocess
import threading
import time

import numpy as np

from . import radiobrowser
from .audio import stream_command
from .config import Settings, Station
from .detector import Detection, Detector, Unmatched
from .fingerprint import SAMPLE_RATE, pcm16_to_float
from .index import FingerprintIndex
from .scanner import MentionScanner
from .sinks import Sink

log = logging.getLogger(__name__)
HEARTBEAT_SEC = 60


def _short_error(stderr: str) -> str:
    """The useful sentence from ffmpeg's stderr, without the banner and line noise."""
    lines = [l.strip() for l in stderr.splitlines() if l.strip()]
    keep = [l for l in lines if not l.startswith(("ffmpeg version", "built with", "configuration:", "libav", "Input #0", "Output #0", "Stream mapping", "Press [q]"))]
    return (keep[-1] if keep else lines[-1] if lines else "stream ended")[:300]


class StationMonitor(threading.Thread):
    def __init__(self, station: Station, index: FingerprintIndex, sink: Sink, settings: Settings,
                 stop: threading.Event, realtime: bool = True, scanner: MentionScanner | None = None):
        super().__init__(name=f"mon-{station.slug}", daemon=True)
        self.st, self.sink, self.s, self.stop_ev, self.realtime = station, sink, settings, stop, realtime
        self.det = Detector(station, index, settings)
        self.scanner = scanner  # brand-mention scanning (optional, EST_MENTIONS=1)
        self.url: str | None = station.stream_url
        self.status = "starting"
        self.error: str | None = None  # last thing ffmpeg complained about, shown in the dashboard
        self.detections = 0
        self.base_override = None  # fixed start time for recorded-file scans

    # -- stream URL ---------------------------------------------------------
    def _resolve(self, force: bool = False) -> str | None:
        if self.st.stream_url and not force:
            return self.st.stream_url
        url = radiobrowser.resolve(self.st.name, uuid=self.st.radio_browser_uuid)
        if url:
            log.info("[%s] resolved stream → %s", self.st.slug, url)
        return url or self.st.stream_url

    def _emit(self, events: list[Detection | Unmatched]) -> None:
        for e in events:
            if isinstance(e, Detection):
                self.detections += 1
                log.info("[%s] ▶ %s — %s  %s→%s (%ss, score %s)", self.st.slug, e.track.title, e.track.artist,
                         e.started_at.strftime("%H:%M:%S"), e.ended_at.strftime("%H:%M:%S"), e.duration_sec, e.score)
                self.sink.detection(e)
            else:
                self.sink.unmatched(e)

    def _beat(self) -> None:
        np_ = self.det.now_playing
        self.sink.heartbeat(self.st, self.status, f"{np_.title} — {np_.artist}" if np_ else None, self.url, self.error)

    # -- main loop ----------------------------------------------------------
    def run(self) -> None:
        failures = 0
        while not self.stop_ev.is_set():
            self.url = self._resolve(force=failures >= 3)
            if not self.url:
                self.status = "no_stream_url"
                self._beat()
                self.stop_ev.wait(300)
                continue
            ok = self._consume(self.url)
            if self.stop_ev.is_set() or not self.realtime:
                if not ok and not self.realtime:
                    self.status = "failed"
                    log.error("[%s] could not read %s", self.st.slug, self.url)
                break
            failures = 0 if ok else failures + 1
            self.status = "reconnecting"
            self._beat()
            self.stop_ev.wait(min(300, 5 * 2 ** min(failures, 6)))  # 5 s → 5 min backoff

    def _consume(self, url: str) -> bool:
        """Read until the stream ends. True if we received meaningful audio."""
        window_n = int(self.s.window_sec * SAMPLE_RATE)
        step_bytes = int(self.s.step_sec * SAMPLE_RATE) * 2
        buf = np.zeros(0, np.float32)
        samples = 0
        base = self.base_override or dt.datetime.now(dt.timezone.utc)
        last_beat = 0.0
        try:
            proc = subprocess.Popen(stream_command(url, self.st.kind), stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        except OSError as e:
            log.error("[%s] ffmpeg failed to start: %s", self.st.slug, e)
            return False
        self.status = "online"
        self.error = None
        try:
            while not self.stop_ev.is_set():
                raw = proc.stdout.read(step_bytes) if proc.stdout else b""
                if not raw:
                    break
                chunk = pcm16_to_float(raw[: len(raw) // 2 * 2])
                samples += chunk.size
                buf = np.concatenate([buf, chunk])[-window_n:]
                if buf.size >= window_n:
                    self._emit(self.det.step(buf, samples / SAMPLE_RATE, base))
                if self.scanner:
                    self.scanner.feed(chunk, samples / SAMPLE_RATE, base, in_music=self.det.matching)
                if time.monotonic() - last_beat > HEARTBEAT_SEC:
                    last_beat = time.monotonic()
                    self._beat()
        finally:
            self._emit(self.det.flush(base))
            if self.scanner:
                self.scanner.flush(base, samples / SAMPLE_RATE)
            proc.kill()
            err = (proc.stderr.read() if proc.stderr else b"").decode(errors="ignore").strip()
            proc.wait(timeout=5)
            if err:
                # Keep the last line: that is the "Connection refused" or
                # "403 Forbidden" that answers "why is nothing being recorded?".
                self.error = _short_error(err)
                log.warning("[%s] stream ended: %s", self.st.slug, self.error)
        return samples > SAMPLE_RATE * 30
