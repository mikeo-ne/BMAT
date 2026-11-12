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
    kind: str = "radio"  # "radio" | "tv" — a TV channel is a station with an HLS/RTMP URL

    @property
    def is_tv(self) -> bool:
        return self.kind == "tv"


@dataclass
class Settings:
    index_path: str = "data/fingerprints.db"
    window_sec: float = 10.0  # audio analysed per check
    step_sec: float = 4.0  # how often each station is checked
    confirm_hits: int = 4  # windows on the song's own timeline before a play counts
    end_gap_sec: float = 32.0  # no consistent match for this long closes a play (talk-over, weak patches)
    min_detection_sec: float = 30.0  # confirmed air time; jingles/stings/coincidences are shorter
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
    # Airplay alerts by email (Brevo). Off until both are set.
    brevo_api_key: str = ""
    alert_from_email: str = ""
    alert_from_name: str = "East Sound"
    # SMS alerts (Africa's Talking). Off until both are set.
    at_username: str = ""
    at_api_key: str = ""
    at_sender_id: str = ""
    at_sandbox: bool = False
    # WhatsApp alerts (Meta WhatsApp Cloud API + an approved template). Off until both are set.
    whatsapp_token: str = ""
    whatsapp_phone_id: str = ""
    whatsapp_template: str = "airplay_alert"
    whatsapp_lang: str = "en"
    site_url: str = "https://eastsound.vercel.app"
    # Clip retention (see retention.py). 0 switches that part off.
    evidence_retention_days: int = 730
    unmatched_retention_days: int = 2
    retention_every_hours: float = 6.0
    stations: list[Station] = field(default_factory=list)

    @property
    def sink_mode(self) -> str:
        if self.playout_url and self.ingest_token:
            return "east-sound"
        if self.supabase_url and self.supabase_service_key:
            return "supabase"
        return "dry-run"

    @property
    def email_on(self) -> bool:
        return bool(self.brevo_api_key and self.alert_from_email)

    @property
    def sms_on(self) -> bool:
        return bool(self.at_username and self.at_api_key)

    @property
    def whatsapp_on(self) -> bool:
        return bool(self.whatsapp_token and self.whatsapp_phone_id)

    @property
    def alerts_on(self) -> bool:
        return bool((self.email_on or self.sms_on or self.whatsapp_on) and self.supabase_url and self.supabase_service_key)

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
                kind=((row.get("kind") or "radio").strip().lower() or "radio"),
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
        brevo_api_key=os.getenv("BREVO_API_KEY", "").strip(),
        alert_from_email=os.getenv("ALERT_FROM_EMAIL", "").strip(),
        alert_from_name=os.getenv("ALERT_FROM_NAME", "East Sound").strip() or "East Sound",
        at_username=os.getenv("AT_USERNAME", "").strip(),
        at_api_key=os.getenv("AT_API_KEY", "").strip(),
        at_sender_id=os.getenv("AT_SENDER_ID", "").strip(),
        at_sandbox=os.getenv("AT_SANDBOX", "").lower() in ("1", "true", "yes"),
        whatsapp_token=os.getenv("WHATSAPP_TOKEN", "").strip(),
        whatsapp_phone_id=os.getenv("WHATSAPP_PHONE_ID", "").strip(),
        whatsapp_template=os.getenv("WHATSAPP_TEMPLATE", "airplay_alert").strip() or "airplay_alert",
        whatsapp_lang=os.getenv("WHATSAPP_LANG", "en").strip() or "en",
        site_url=os.getenv("SITE_URL", "https://eastsound.vercel.app").strip().rstrip("/"),
    )
    for k in ("evidence_retention_days", "unmatched_retention_days"):
        v = os.getenv(f"EST_{k.upper()}")
        if v and v.strip().isdigit():
            setattr(s, k, int(v))
    v = os.getenv("EST_RETENTION_EVERY_HOURS")
    if v:
        s.retention_every_hours = max(1.0, float(v))
    for k in ("window_sec", "step_sec", "end_gap_sec", "min_detection_sec", "unmatched_every_sec"):
        v = os.getenv(f"EST_{k.upper()}")
        if v:
            setattr(s, k, float(v))
    if stations_path:
        s.stations = [st for st in load_stations(stations_path) if st.enabled]
    return s
