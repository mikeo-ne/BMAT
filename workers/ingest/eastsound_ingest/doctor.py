"""Pre-flight check: is this worker actually able to feed the dashboards?

`run` fails quietly when something is misconfigured — a dry-run sink, a missing
service-role key or an unreachable project all look the same in the logs as
"no detections yet". `doctor` answers the question in one command, so a Railway
or Fly deploy can be trusted (or fixed) in seconds.

    python -m eastsound_ingest --stations stations.csv doctor
"""
from __future__ import annotations

import json
import shutil
import urllib.error
import urllib.request
from dataclasses import dataclass

from .config import Settings

OK, WARN, FAIL = "ok", "warn", "fail"
MARK = {OK: "✓", WARN: "!", FAIL: "✗"}


@dataclass
class Check:
    label: str
    state: str
    detail: str
    fix: str | None = None


def http_get(url: str, headers: dict[str, str], timeout: float = 10.0) -> tuple[int, bytes]:
    """Minimal GET returning (status, body). Non-2xx is a value, not an exception."""
    req = urllib.request.Request(url, headers=headers, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()
    except Exception as e:  # network, DNS, TLS
        raise RuntimeError(f"{type(e).__name__}: {e}") from e


def _stations(s: Settings) -> Check:
    enabled = [st for st in s.stations if st.enabled]
    if not s.stations:
        return Check("Station panel", FAIL, "no stations loaded",
                     "Pass --stations stations.csv, or set EST_STATIONS to a JSON list.")
    if not enabled:
        return Check("Station panel", FAIL, f"{len(s.stations)} stations but none enabled",
                     "Mark at least one row enabled (directory_status OK) in stations.csv.")
    no_url = [st for st in enabled if not st.stream_url]
    detail = f"{len(enabled)} of {len(s.stations)} stations enabled"
    if no_url:
        detail += f"; {len(no_url)} resolved via Radio Browser at runtime"
    return Check("Station panel", OK, detail)


def _sink(s: Settings) -> Check:
    mode = s.sink_mode
    if mode == "dry-run":
        return Check("Output sink", WARN, "dry run — detections go to files, not the database",
                     "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to feed the dashboards.")
    target = "Supabase" if mode == "supabase" else s.playout_url
    return Check("Output sink", OK, f"{mode} → {target or 'configured'}")


def _credentials(s: Settings) -> Check:
    if s.sink_mode != "supabase":
        return Check("Service-role key", WARN, "not needed for this sink",
                     "Only the Supabase sink uses SUPABASE_SERVICE_ROLE_KEY.")
    if not s.supabase_url.startswith("https://"):
        return Check("Project URL", FAIL, f"{s.supabase_url or '(empty)'} is not HTTPS",
                     "Copy the Project URL from Supabase → Project Settings → Data API.")
    if len(s.supabase_service_key) < 40:
        return Check("Service-role key", FAIL, "missing or far too short",
                     "Railway/Fly → Variables: SUPABASE_SERVICE_ROLE_KEY (Project Settings → API keys). "
                     "Never put it in Vercel.")
    return Check("Service-role key", OK, f"present ({s.supabase_service_key[:6]}…)")


def _database(s: Settings, get) -> Check:
    if s.sink_mode != "supabase":
        return Check("Database", WARN, "not checked (no Supabase sink)",
                     "Configure the Supabase sink and re-run doctor.")
    headers = {"apikey": s.supabase_service_key, "Authorization": f"Bearer {s.supabase_service_key}"}
    try:
        status, body = get(f"{s.supabase_url}/rest/v1/stations?select=slug&limit=200", headers)
    except RuntimeError as e:
        return Check("Database", FAIL, f"unreachable: {e}",
                     "Check the project URL and that the project is not paused.")
    if status >= 400:
        msg = ""
        try:
            msg = (json.loads(body) or {}).get("message", "")
        except Exception:
            pass
        return Check("Database", FAIL, f"HTTP {status}{f': {msg}' if msg else ''}",
                     "Run supabase/setup.sql (or migrations 0001-0004) on this project.")
    rows = json.loads(body or b"[]")
    return Check("Database", OK, f"{len(rows)} stations in the panel")


def _bucket(s: Settings, get) -> Check:
    if s.sink_mode != "supabase":
        return Check("Evidence bucket", WARN, "not checked (no Supabase sink)")
    headers = {"apikey": s.supabase_service_key, "Authorization": f"Bearer {s.supabase_service_key}"}
    try:
        status, _ = get(f"{s.supabase_url}/storage/v1/bucket/{s.evidence_bucket}", headers)
    except RuntimeError as e:
        return Check("Evidence bucket", FAIL, f"unreachable: {e}")
    if status == 404:
        return Check("Evidence bucket", FAIL, f"'{s.evidence_bucket}' does not exist",
                     "Run migrations 0002 (creates the private evidence bucket).")
    if status >= 400:
        return Check("Evidence bucket", FAIL, f"HTTP {status}",
                     "The service-role key must be allowed to read the bucket.")
    return Check("Evidence bucket", OK, f"'{s.evidence_bucket}' reachable, clips will be private")


def _index(s: Settings) -> Check:
    from pathlib import Path

    p = Path(s.index_path)
    if not p.exists():
        return Check("Fingerprint index", WARN, "empty — every play will be reported as unmatched",
                     "Enroll masters: python -m eastsound_ingest enroll-dir /masters")
    return Check("Fingerprint index", OK, f"{p} ({p.stat().st_size // 1024} KB)")


def _ffmpeg(which) -> Check:
    path = which("ffmpeg")
    if not path:
        return Check("ffmpeg", FAIL, "not on PATH — streams cannot be decoded",
                     "Use the Docker image (bundles ffmpeg) or apt-get install ffmpeg.")
    return Check("ffmpeg", OK, path)


def run_checks(s: Settings, get=http_get, which=shutil.which) -> list[Check]:
    """Ordered so the first failure an operator sees is the root cause."""
    return [
        _ffmpeg(which),
        _stations(s),
        _sink(s),
        _credentials(s),
        _database(s, get),
        _bucket(s, get),
        _index(s),
    ]


def render(checks: list[Check]) -> str:
    lines = []
    for c in checks:
        lines.append(f"  {MARK.get(c.state, '?')} {c.label:<20} {c.detail}")
        if c.fix and c.state != OK:
            lines.append(f"    → {c.fix}")
    return "\n".join(lines)


def main(s: Settings) -> int:
    checks = run_checks(s)
    print("\nEast Sound ingest worker — pre-flight\n")
    print(render(checks))
    fails = [c for c in checks if c.state == FAIL]
    warns = [c for c in checks if c.state == WARN]
    print("")
    if fails:
        print(f"{len(fails)} blocking problem{'s' if len(fails) != 1 else ''}. "
              "Fix the ✗ items above before running `run`.")
        return 1
    if warns:
        print(f"Ready to run, with {len(warns)} warning{'s' if len(warns) != 1 else ''}.")
        return 0
    print("All clear — this worker will feed the dashboards.")
    return 0
