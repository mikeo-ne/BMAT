"""Worker configuration: environment variables + station list."""
from __future__ import annotations

import csv
import json
import os
import re
from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class Station:
    slug: str
    name: str
    region: str = ""
    frequency: str = ""
    stream_url: str | None = None  # explicit URL wins; otherwise resolved via Radio Browser
    radio_browser_uuid: str | None = None
    enabled: bool = True


@dataclass
class Settings:
    index_path: str = "data/fingerprints.db"
    window_sec: float = 10.0  # audio analysed per check
    step_sec: float = 4.0  # how often each station is checked
    confirm_hits: int = 2  # consecutive matches before a detection is opened
    end_gap_sec: float = 16.0  # no match for this long closes a detection
    min_detection_sec: float = 12.0
    unmatched_every_sec: float = 600.0  # at most one unmatched sample per station per 10 min
    supabase_url: str = ""
    supabase_service_key: str = ""
    evidence_bucket: str = "evidence"
    out_dir: str = "data/out"  # dry-run sink
    # East Sound app (POST /api/playout) — takes priority over Supabase when set
    playout_url: str = ""
    ingest_token: str = ""
    evidence_dir: str = ""
    evidence_public_base: str = ""  # HTTPS base URL that serves evidence_dir
    send_unmatched: bool = False
    stations: list[Station] = field(default_factory=list)

    @property
    def sink_mode(self) -> str:
        if self.playout_url and self.ingest_token:
            return "east-sound"
        if self.supabase_url and self.supabase_service_key:
            return "supabase"
        return "dry-run"

    @property
    def dry_run(self) -> bool:
        return self.sink_mode == "dry-run"


def slugify(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def _stream_url(row: dict) -> str | None:
    """Explicit URL, else the panel's recorded stream_host when it carries a path."""
    explicit = (row.get("stream_url") or "").strip()
    if explicit:
        return explicit
    host = (row.get("stream_host") or "").strip()
    if host.startswith(("http://", "https://")):
        return host
    if "/" in host:
        # The panel records host+path without a scheme (e.g.
        # "dc4.serverse.com/proxy/pearlfm/stream").
        return f"https://{host}"
    return None


def _enabled(row: dict) -> bool:
    """
    Explicit `enabled` wins; otherwise fall back to the panel's directory
    status. Only stations whose stream was actually captured ("OK",
    "OK (stale)") are monitored — "listed" entries have no URL to play yet.
    """
    cell = row.get("enabled")
    if cell is not None:
        return cell.strip().lower() not in ("false", "0", "no")
    status = (row.get("directory_status") or "").strip().lower()
    if status:
        return status.startswith("ok")
    return True


def load_stations(path: str | Path) -> list[Station]:
    """
    Reads either the platform panel (supabase/seed/uganda_stream_stations.csv)
    or a legacy worker file. Both share `station`, `frequency`, `region`; the
    platform panel adds stream_host/directory_status instead of
    stream_url/enabled.
    """
    p = Path(path)
    if p.suffix == ".json":
        return [Station(**s) for s in json.loads(p.read_text())]
    out: list[Station] = []
    with p.open(newline="") as f:
        for row in csv.DictReader(f):
            name = (row.get("station") or row.get("name") or "").strip()
            if not name:
                continue
            out.append(Station(
                slug=row.get("slug") or slugify(f"{name} {row.get('frequency', '')}"),
                name=name,
                region=(row.get("region") or "").split(" ")[0],
                frequency=row.get("frequency") or "",
                stream_url=_stream_url(row),
                radio_browser_uuid=(row.get("radio_browser_uuid") or "").strip() or None,
                enabled=_enabled(row),
            ))
    return out


def load_settings(stations_path: str | None) -> Settings:
    s = Settings(
        index_path=os.getenv("EST_INDEX_PATH", "data/fingerprints.db"),
        supabase_url=os.getenv("SUPABASE_URL", "").rstrip("/"),
        supabase_service_key=os.getenv("SUPABASE_SERVICE_ROLE_KEY", ""),
        evidence_bucket=os.getenv("EST_EVIDENCE_BUCKET", "evidence"),
        out_dir=os.getenv("EST_OUT_DIR", "data/out"),
        playout_url=os.getenv("EAST_SOUND_PLAYOUT_URL", "").strip(),
        ingest_token=os.getenv("EAST_SOUND_INGEST_TOKEN", "").strip(),
        evidence_dir=os.getenv("EST_EVIDENCE_DIR", ""),
        evidence_public_base=os.getenv("EST_EVIDENCE_PUBLIC_BASE", ""),
        send_unmatched=os.getenv("EST_SEND_UNMATCHED", "").lower() in ("1", "true", "yes"),
    )
    for k in ("window_sec", "step_sec", "end_gap_sec", "min_detection_sec", "unmatched_every_sec"):
        v = os.getenv(f"EST_{k.upper()}")
        if v:
            setattr(s, k, float(v))
    if stations_path:
        s.stations = [st for st in load_stations(stations_path) if st.enabled]
    return s
