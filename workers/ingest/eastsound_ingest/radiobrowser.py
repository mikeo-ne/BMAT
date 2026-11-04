"""Resolve a station's *current* stream URL from the open Radio Browser directory.

Station links change (new hosts, expiring tokens), so the worker looks them up at
start-up and again whenever a stream keeps failing, instead of hard-coding them.
"""
from __future__ import annotations

import json
import logging
import urllib.parse
import urllib.request

log = logging.getLogger(__name__)

MIRRORS = ["de1.api.radio-browser.info", "nl1.api.radio-browser.info", "at1.api.radio-browser.info"]
UA = "EastSoundMonitor/0.1 (+https://eastsound.ug)"


def _get(path: str) -> list[dict]:
    last: Exception | None = None
    for host in MIRRORS:
        try:
            req = urllib.request.Request(f"https://{host}{path}", headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=10) as r:
                return json.loads(r.read().decode())
        except Exception as e:  # try the next mirror
            last = e
    raise RuntimeError(f"Radio Browser unreachable: {last}")


def resolve(name: str, countrycode: str = "UG", uuid: str | None = None) -> str | None:
    """Best working stream URL for a station name (or exact Radio Browser uuid)."""
    try:
        if uuid:
            rows = _get(f"/json/stations/byuuid/{urllib.parse.quote(uuid)}")
        else:
            q = urllib.parse.urlencode({"name": name, "countrycode": countrycode, "hidebroken": "true",
                                        "order": "votes", "reverse": "true", "limit": 10})
            rows = _get(f"/json/stations/search?{q}")
    except Exception as e:
        log.warning("radio-browser lookup failed for %s: %s", name, e)
        return None
    ok = [r for r in rows if r.get("lastcheckok") == 1 and r.get("url_resolved")]
    if not ok:
        return None
    ok.sort(key=lambda r: (int(r.get("bitrate") or 0), int(r.get("votes") or 0)), reverse=True)
    return ok[0]["url_resolved"]
