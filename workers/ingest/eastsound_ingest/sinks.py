"""Where detections go: Supabase (live) or JSONL files (dry run).

All writes pass through one background thread so a slow network never stalls
the stream readers. Each write is retried 3 times; anything still failing is
logged to data/out/failed-events.log (event type + error) for follow-up.
"""
from __future__ import annotations

import datetime as dt
import json
import logging
import queue
import re
import threading
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

from .audio import encode_mp3
from .config import Settings, Station
from .detector import Detection, Unmatched
from .mentions import Keyword, KeywordSet
from .scanner import Mention

log = logging.getLogger(__name__)
UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I)


def _slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")[:40] or "brand"


def _iso(t: dt.datetime) -> str:
    return t.astimezone(dt.timezone.utc).isoformat(timespec="seconds")


class Sink:
    def detection(self, d: Detection) -> None: ...
    def unmatched(self, u: Unmatched) -> None: ...
    def heartbeat(self, st: Station, status: str, now_playing: str | None, stream_url: str | None) -> None: ...
    def mention(self, m: Mention) -> None: ...
    def close(self) -> None: ...


class JsonlSink(Sink):
    """Dry-run sink: one JSON line per event + evidence clips as MP3 files."""

    def __init__(self, out_dir: str):
        self.dir = Path(out_dir)
        (self.dir / "evidence").mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()

    def _write(self, name: str, row: dict[str, Any]) -> None:
        with self._lock, (self.dir / name).open("a") as f:
            f.write(json.dumps(row) + "\n")

    def detection(self, d: Detection) -> None:
        clip = self.dir / "evidence" / f"{d.station.slug}-{d.started_at:%Y%m%dT%H%M%S}.mp3"
        clip.write_bytes(encode_mp3(d.evidence))
        self._write("detections.jsonl", {
            "station": d.station.slug, "title": d.track.title, "artist": d.track.artist, "isrc": d.track.isrc,
            "recording_id": d.track.recording_id, "started_at": _iso(d.started_at), "ended_at": _iso(d.ended_at),
            "duration_sec": d.duration_sec, "score": d.score, "confidence": d.confidence,
            "track_offset_sec": d.track_offset_sec, "evidence": str(clip),
        })

    def unmatched(self, u: Unmatched) -> None:
        clip = self.dir / "evidence" / f"unmatched-{u.station.slug}-{u.heard_at:%Y%m%dT%H%M%S}.mp3"
        clip.write_bytes(encode_mp3(u.audio))
        self._write("unmatched.jsonl", {"station": u.station.slug, "heard_at": _iso(u.heard_at), "rms": round(u.rms, 3), "evidence": str(clip)})

    def mention(self, m: Mention) -> None:
        clip = self.dir / "evidence" / f"mention-{m.station.slug}-{m.heard_at:%Y%m%dT%H%M%S}-{_slug(m.brand)}.mp3"
        clip.write_bytes(encode_mp3(m.audio))
        self._write("mentions.jsonl", {
            "station": m.station.slug, "heard_at": _iso(m.heard_at), "brand": m.brand, "heard": m.heard,
            "score": m.score, "transcript": m.transcript, "evidence": str(clip),
        })

    def heartbeat(self, st: Station, status: str, now_playing: str | None, stream_url: str | None) -> None:
        self._write("heartbeats.jsonl", {"station": st.slug, "at": _iso(dt.datetime.now(dt.timezone.utc)), "status": status, "now_playing": now_playing})


class SupabaseSink(Sink):
    """Writes through PostgREST + Storage with the service-role key (server only)."""

    def __init__(self, s: Settings):
        self.url, self.key, self.bucket = s.supabase_url, s.supabase_service_key, s.evidence_bucket
        self._station_ids: dict[str, str] = {}

    def _req(self, method: str, path: str, body: bytes | None, headers: dict[str, str]) -> bytes:
        h = {"apikey": self.key, "Authorization": f"Bearer {self.key}", **headers}
        req = urllib.request.Request(self.url + path, data=body, method=method, headers=h)
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.read()

    def _rest(self, method: str, table: str, rows: Any, query: str = "", prefer: str = "return=minimal") -> Any:
        raw = self._req(method, f"/rest/v1/{table}{query}", json.dumps(rows).encode(),
                        {"Content-Type": "application/json", "Prefer": prefer})
        return json.loads(raw) if raw else None

    def _station_id(self, st: Station, stream_url: str | None = None) -> str:
        if st.slug in self._station_ids and stream_url is None:
            return self._station_ids[st.slug]
        row = {"slug": st.slug, "name": st.name, "frequency": st.frequency or None,
               "region": st.region if st.region in ("Central", "Western", "Eastern", "Northern") else None}
        if stream_url:
            row["stream_url"] = stream_url
        res = self._rest("POST", "stations", [row], "?on_conflict=slug",
                         "resolution=merge-duplicates,return=representation")
        self._station_ids[st.slug] = res[0]["id"]
        return res[0]["id"]

    def _upload(self, path: str, mp3: bytes) -> str:
        self._req("POST", f"/storage/v1/object/{self.bucket}/{path}", mp3,
                  {"Content-Type": "audio/mpeg", "x-upsert": "true"})
        return path

    def detection(self, d: Detection) -> None:
        sid = self._station_id(d.station)
        path = self._upload(f"stations/{d.station.slug}/{d.started_at:%Y/%m/%d}/{d.started_at:%H%M%S}.mp3", encode_mp3(d.evidence))
        rid = d.track.recording_id if d.track.recording_id and UUID_RE.match(d.track.recording_id) else None
        self._rest("POST", "detections", [{
            "recording_id": rid, "station_id": sid, "detected_at": _iso(d.started_at), "ended_at": _iso(d.ended_at),
            "duration_sec": d.duration_sec, "confidence": d.confidence, "match_score": d.score,
            "track_offset_sec": d.track_offset_sec, "matched_title": d.track.title, "matched_artist": d.track.artist,
            "source": "stream", "evidence_path": path,
        }])

    def unmatched(self, u: Unmatched) -> None:
        sid = self._station_id(u.station)
        path = self._upload(f"unmatched/{u.station.slug}/{u.heard_at:%Y/%m/%d/%H%M%S}.mp3", encode_mp3(u.audio))
        self._rest("POST", "unmatched_clips", [{"station_id": sid, "heard_at": _iso(u.heard_at), "evidence_path": path, "rms": round(u.rms, 3)}])

    def mention(self, m: Mention) -> None:
        sid = self._station_id(m.station)
        path = self._upload(f"mentions/{m.station.slug}/{m.heard_at:%Y/%m/%d/%H%M%S}-{_slug(m.brand)}.mp3", encode_mp3(m.audio))
        self._rest("POST", "mentions", [{
            "station_id": sid, "keyword_id": m.keyword_id if m.keyword_id and UUID_RE.match(m.keyword_id) else None,
            "brand": m.brand, "heard_at": _iso(m.heard_at), "heard": m.heard[:200], "transcript": m.transcript[:1000],
            "score": m.score, "evidence_path": path,
        }])

    def load_keywords(self) -> KeywordSet:
        """Active brands from tracked_keywords (edited by the CMO in the dashboard)."""
        raw = self._req("GET", "/rest/v1/tracked_keywords?select=id,brand,terms,aliases&active=eq.true", None,
                        {"Accept": "application/json"})
        rows = json.loads(raw or b"[]")
        return KeywordSet([Keyword(r["brand"], tuple(r.get("terms") or [r["brand"]]), tuple(r.get("aliases") or []), r["id"])
                           for r in rows if r.get("brand")])

    def heartbeat(self, st: Station, status: str, now_playing: str | None, stream_url: str | None) -> None:
        sid = self._station_id(st, stream_url)
        self._rest("PATCH", "stations", {"stream_status": status, "now_playing": now_playing,
                                         "last_heartbeat": _iso(dt.datetime.now(dt.timezone.utc))}, f"?id=eq.{sid}")


class EastSoundPlayoutSink(Sink):
    """Posts captures to the East Sound app's `POST /api/playout` ingestion API.

    Record shape and rules follow docs/notifications-and-capture.md in the
    East Sound repo: stable idempotent IDs, `source: "captured"`, station IDs
    from the app's monitored panel, catalogue `trackId` (enrolled as the
    recording_id) or null when unmatched, confidence 0–1, and optional
    10-second evidence with a public HTTPS URL + SHA-256.
    """

    ID_SAFE = re.compile(r"[^a-zA-Z0-9:_-]")

    def __init__(self, s: Settings):
        self.url = s.playout_url
        self.token = s.ingest_token
        self.evidence_dir = Path(s.evidence_dir) if s.evidence_dir else None
        self.evidence_base = s.evidence_public_base.rstrip("/") if s.evidence_public_base else ""
        self.send_unmatched = s.send_unmatched
        if self.evidence_dir:
            self.evidence_dir.mkdir(parents=True, exist_ok=True)

    def _event_id(self, *parts: str) -> str:
        return self.ID_SAFE.sub("-", ":".join(["esi", *parts]))[:160]

    def _evidence(self, name: str, mp3: bytes) -> dict[str, Any] | None:
        """Write the clip where a public HTTPS host serves it; skip evidence otherwise."""
        if not (self.evidence_dir and self.evidence_base.startswith("https://")):
            return None
        import hashlib

        (self.evidence_dir / name).write_bytes(mp3)
        return {"url": f"{self.evidence_base}/{name}", "sha256": hashlib.sha256(mp3).hexdigest(), "durationSec": 10}

    def _post(self, records: list[dict[str, Any]]) -> None:
        req = urllib.request.Request(
            self.url, data=json.dumps({"records": records}).encode(), method="POST",
            headers={"Authorization": f"Bearer {self.token}", "Content-Type": "application/json",
                     "User-Agent": "EastSoundFingerprintIngest/0.1"})
        try:
            with urllib.request.urlopen(req, timeout=20) as r:
                res = json.loads(r.read() or b"{}")
                log.info("playout API accepted: %s", res)
        except urllib.error.HTTPError as e:
            detail = e.read().decode(errors="ignore")[:500]
            if e.code in (429,) or e.code >= 500:
                raise  # transient → AsyncSink retries
            # 4xx = the record itself was rejected (bad station/track/timestamp, token): retrying won't help.
            log.error("playout API rejected record (%s): %s", e.code, detail)

    def detection(self, d: Detection) -> None:
        started = d.started_at.astimezone(dt.timezone.utc)
        eid = self._event_id(d.station.slug, started.strftime("%Y%m%dT%H%M%SZ"), d.track.recording_id or str(d.track.id))
        rec: dict[str, Any] = {
            "id": eid,
            "source": "captured",
            "stationId": d.station.slug,
            "detectedAt": started.isoformat(timespec="seconds").replace("+00:00", "Z"),
            "trackId": d.track.recording_id,
            "isrc": d.track.isrc,
            "durationSec": max(1, d.duration_sec),
            "confidence": round(d.confidence / 100.0, 3),
        }
        ev = self._evidence(f"{eid.replace(':', '_')}.mp3", encode_mp3(d.evidence))
        if ev:
            rec["evidence"] = ev
        self._post([rec])

    def unmatched(self, u: Unmatched) -> None:
        if not self.send_unmatched:
            return
        heard = u.heard_at.astimezone(dt.timezone.utc)
        eid = self._event_id(u.station.slug, heard.strftime("%Y%m%dT%H%M%SZ"), "unmatched")
        rec: dict[str, Any] = {
            "id": eid, "source": "captured", "stationId": u.station.slug,
            "detectedAt": heard.isoformat(timespec="seconds").replace("+00:00", "Z"),
            "trackId": None, "isrc": None, "durationSec": 10, "confidence": 0,
        }
        ev = self._evidence(f"{eid.replace(':', '_')}.mp3", encode_mp3(u.audio))
        if ev:
            rec["evidence"] = ev
        self._post([rec])

    def heartbeat(self, st: Station, status: str, now_playing: str | None, stream_url: str | None) -> None:
        log.debug("[%s] %s now_playing=%s", st.slug, status, now_playing)  # East Sound probes health itself


class AsyncSink(Sink):
    """Runs any sink on a background thread; logs writes that still fail after retries."""

    def __init__(self, inner: Sink, spool_dir: str):
        self.inner = inner
        self.q: queue.Queue = queue.Queue(maxsize=10000)
        self.spool = Path(spool_dir) / "failed-events.log"
        self.spool.parent.mkdir(parents=True, exist_ok=True)
        self.t = threading.Thread(target=self._run, name="sink", daemon=True)
        self.t.start()

    def _run(self) -> None:
        while True:
            item = self.q.get()
            if item is None:
                return
            name, args = item
            for attempt in range(3):
                try:
                    getattr(self.inner, name)(*args)
                    break
                except (urllib.error.URLError, OSError, ValueError) as e:
                    if attempt == 2:
                        log.error("sink %s failed: %s", name, e)
                        with self.spool.open("a") as f:
                            f.write(json.dumps({"event": name, "error": str(e), "at": _iso(dt.datetime.now(dt.timezone.utc))}) + "\n")
                except Exception:
                    log.exception("sink %s crashed", name)
                    break

    def _put(self, name: str, *args: Any) -> None:
        try:
            self.q.put_nowait((name, args))
        except queue.Full:
            log.error("sink queue full; dropping %s", name)

    def detection(self, d: Detection) -> None: self._put("detection", d)
    def unmatched(self, u: Unmatched) -> None: self._put("unmatched", u)
    def mention(self, m: Mention) -> None: self._put("mention", m)
    def heartbeat(self, st: Station, status: str, now_playing: str | None, stream_url: str | None) -> None:
        self._put("heartbeat", st, status, now_playing, stream_url)

    def close(self) -> None:
        self.q.put(None)
        self.t.join(timeout=30)
