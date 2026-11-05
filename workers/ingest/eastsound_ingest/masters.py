"""Learn songs uploaded in the dashboards.

A label or artist uploads a song: the browser creates the `recordings` row and
stores a small mono 11 kHz reference copy at `masters/<recording id>/…`. This
loop finds recordings that have a reference but are not enrolled yet, adds
them to the fingerprint index under their recording id (so detections link
straight to the song), and marks them enrolled — or records a plain-language
error the uploader sees next to the song.

Replacing the audio clears `enrolled_at`, so the song is simply learned again
(the index replaces a recording id's old fingerprints).
"""
from __future__ import annotations

import json
import logging
import threading
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Callable

from .audio import decode_file
from .fingerprint import SAMPLE_RATE, landmarks
from .index import FingerprintIndex

log = logging.getLogger(__name__)

BUCKET = "masters"
MIN_SECONDS = 15  # shorter than this can't be recognised reliably


@dataclass(frozen=True)
class Pending:
    id: str
    title: str
    artist: str
    isrc: str | None
    path: str


class MasterSource:
    """PostgREST + Storage access with the service-role key (worker only)."""

    def __init__(self, url: str, key: str, timeout: float = 30):
        self.url, self.key, self.timeout = url.rstrip("/"), key, timeout

    def _req(self, method: str, path: str, body: dict | None = None, prefer: str | None = None) -> bytes:
        h = {"apikey": self.key, "Authorization": f"Bearer {self.key}", "Content-Type": "application/json"}
        if prefer:
            h["Prefer"] = prefer
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(self.url + path, data=data, method=method, headers=h)
        with urllib.request.urlopen(req, timeout=self.timeout) as r:
            return r.read()

    def pending(self, limit: int = 20) -> list[Pending]:
        q = ("select=id,title,artist_name,isrc,master_path&master_path=not.is.null&enrolled_at=is.null"
             f"&enroll_error=is.null&order=created_at.asc&limit={limit}")
        rows = json.loads(self._req("GET", f"/rest/v1/recordings?{q}") or b"[]")
        return [Pending(r["id"], r["title"], r.get("artist_name") or "Unknown", r.get("isrc"), r["master_path"]) for r in rows]

    def learned(self, page: int = 500) -> list[Pending]:
        """Every song the database says is already learned (to rebuild a fresh index)."""
        out: list[Pending] = []
        offset = 0
        while True:
            q = ("select=id,title,artist_name,isrc,master_path&master_path=not.is.null&enrolled_at=not.is.null"
                 f"&order=created_at.asc&limit={page}&offset={offset}")
            rows = json.loads(self._req("GET", f"/rest/v1/recordings?{q}") or b"[]")
            out += [Pending(r["id"], r["title"], r.get("artist_name") or "Unknown", r.get("isrc"), r["master_path"]) for r in rows]
            if len(rows) < page:
                return out
            offset += page

    def signed_url(self, path: str, seconds: int = 600) -> str:
        raw = self._req("POST", f"/storage/v1/object/sign/{BUCKET}/{urllib.parse.quote(path)}", {"expiresIn": seconds})
        signed = json.loads(raw)["signedURL"]  # "/object/sign/masters/…?token=…"
        return f"{self.url}/storage/v1{signed}"

    def mark(self, rec_id: str, *, enrolled_at: str | None = None, error: str | None = None, duration: int | None = None) -> None:
        body: dict = {"enroll_error": error}
        if enrolled_at:
            body["enrolled_at"] = enrolled_at
        if duration is not None:
            body["duration_sec"] = duration
        # Only update while the reference is unchanged; a re-upload in the meantime wins.
        self._req("PATCH", f"/rest/v1/recordings?id=eq.{rec_id}&enrolled_at=is.null", body, "return=minimal")


def _plain(e: Exception) -> str:
    import subprocess

    text = str(e)
    if isinstance(e, subprocess.CalledProcessError):  # ffmpeg could not decode it
        return "The audio file couldn't be read. Upload it again as WAV or MP3."
    if "Invalid data" in text or "moov atom" in text or "could not find codec" in text.lower():
        return "The audio file couldn't be read. Upload it again as WAV or MP3."
    if "HTTP Error 404" in text or "Object not found" in text:
        return "The uploaded audio is missing. Use “Replace audio” to upload it again."
    return "The song couldn't be learned. Try replacing the audio; if it keeps failing, contact support."


def enroll_pending(src: MasterSource, idx: FingerprintIndex, now: Callable[[], str], decode=decode_file) -> tuple[int, int]:
    """One pass: learn every pending song. Returns (learned, failed)."""
    ok = failed = 0
    for p in src.pending():
        try:
            x = decode(src.signed_url(p.path))
            seconds = x.size / SAMPLE_RATE
            if seconds < MIN_SECONDS:
                src.mark(p.id, error=f"The audio is only {seconds:.0f} seconds long — upload the full song.")
                failed += 1
                continue
            idx.enroll(landmarks(x), title=p.title, artist=p.artist, duration_sec=seconds, recording_id=p.id, isrc=p.isrc)
            src.mark(p.id, enrolled_at=now(), error=None, duration=round(seconds))
            ok += 1
            log.info("learned %s — %s (%.0fs)", p.artist, p.title, seconds)
        except Exception as e:  # one bad upload must not stop the rest
            failed += 1
            log.warning("could not learn %s (%s): %s", p.title, p.id, e)
            try:
                src.mark(p.id, error=_plain(e))
            except Exception:  # network blip: leave it pending, try next pass
                log.debug("could not record the error for %s", p.id, exc_info=True)
    return ok, failed


def relearn_missing(src: MasterSource, idx: FingerprintIndex, decode=decode_file) -> tuple[int, int]:
    """Re-learn songs the database marks as learned but this worker's index lacks.

    A new server (or a lost volume) starts with an empty index; without this,
    songs learned on the old server would never be recognised again.
    """
    have = {t.recording_id for t in idx.tracks}
    ok = failed = 0
    for p in src.learned():
        if p.id in have:
            continue
        try:
            x = decode(src.signed_url(p.path))
            idx.enroll(landmarks(x), title=p.title, artist=p.artist, duration_sec=x.size / SAMPLE_RATE, recording_id=p.id, isrc=p.isrc)
            ok += 1
        except Exception as e:  # keep going; the song stays marked learned on the old index
            failed += 1
            log.warning("could not re-learn %s (%s): %s", p.title, p.id, e)
    if ok or failed:
        log.info("rebuilt local index: %d songs re-learned, %d failed", ok, failed)
    return ok, failed


class MasterSync(threading.Thread):
    """Background loop inside `run`: checks for new uploads every `every` seconds."""

    def __init__(self, src: MasterSource, idx: FingerprintIndex, stop: threading.Event, every: float = 120):
        super().__init__(name="master-sync", daemon=True)
        self.src, self.idx, self.stop, self.every = src, idx, stop, every

    def run(self) -> None:
        import datetime as dt

        now = lambda: dt.datetime.now(dt.timezone.utc).isoformat()  # noqa: E731
        try:
            relearn_missing(self.src, self.idx)
        except Exception as e:
            log.warning("could not check for songs to re-learn: %s", e)
        while not self.stop.is_set():
            try:
                ok, failed = enroll_pending(self.src, self.idx, now)
                if ok or failed:
                    log.info("uploaded songs: %d learned, %d failed · %d in index", ok, failed, len(self.idx.tracks))
            except Exception as e:
                log.warning("checking for uploaded songs failed: %s", e)
            self.stop.wait(self.every)
