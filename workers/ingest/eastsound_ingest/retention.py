"""Deletes old audio clips from Supabase Storage, on a schedule (Privacy Notice: retention).

  Play evidence (detections) and brand-mention clips: kept EST_EVIDENCE_RETENTION_DAYS
  (default 730 = 24 months, as the Privacy Notice promises). The clip is deleted and
  evidence_path cleared; the play itself stays for royalty history.

  Unmatched samples (radio we heard but couldn't identify): kept
  EST_UNMATCHED_RETENTION_DAYS (default 2) unless a CMO matched them to a song, in
  which case they are evidence and follow the 24-month rule. The row and clip are
  deleted together. About 3,600 arrive a day (~290 MB), so this is what keeps
  storage inside the plan.

Setting either to 0 switches that part off. Runs once shortly after start-up and
then every EST_RETENTION_EVERY_HOURS (default 6). Storage objects are deleted
first and the database rows second, so a crash in between leaves a row pointing at
nothing (harmless; the player shows "clip expired") rather than an orphaned file
nobody can find.
"""
from __future__ import annotations

import datetime as dt
import json
import logging
import threading
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Protocol

log = logging.getLogger(__name__)

BATCH = 200  # Storage accepts up to 1,000 prefixes per delete; keep requests small
MAX_BATCHES = 250  # per run, so a huge backlog is worked off over several runs


class Store(Protocol):
    def old_rows(self, table: str, filters: str, limit: int) -> list[dict]: ...
    def delete_objects(self, paths: list[str]) -> None: ...
    def delete_rows(self, table: str, ids: list[int | str]) -> None: ...
    def clear_paths(self, table: str, ids: list[int | str]) -> None: ...


class SupabaseStore:
    """PostgREST + Storage with the service-role key (worker only)."""

    def __init__(self, url: str, key: str, bucket: str, timeout: float = 60):
        self.url, self.key, self.bucket, self.timeout = url.rstrip("/"), key, bucket, timeout

    def _req(self, method: str, path: str, body: object | None = None, prefer: str | None = None) -> bytes:
        h = {"apikey": self.key, "Authorization": f"Bearer {self.key}", "Content-Type": "application/json"}
        if prefer:
            h["Prefer"] = prefer
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(self.url + path, data=data, method=method, headers=h)
        with urllib.request.urlopen(req, timeout=self.timeout) as r:
            return r.read()

    def old_rows(self, table: str, filters: str, limit: int) -> list[dict]:
        return json.loads(self._req("GET", f"/rest/v1/{table}?select=id,evidence_path&{filters}&order=id.asc&limit={limit}") or b"[]")

    def delete_objects(self, paths: list[str]) -> None:
        if paths:
            self._req("DELETE", f"/storage/v1/object/{urllib.parse.quote(self.bucket)}", {"prefixes": paths})

    def delete_rows(self, table: str, ids: list[int | str]) -> None:
        if ids:
            self._req("DELETE", f"/rest/v1/{table}?id=in.({_ids(ids)})", prefer="return=minimal")

    def clear_paths(self, table: str, ids: list[int | str]) -> None:
        if ids:
            self._req("PATCH", f"/rest/v1/{table}?id=in.({_ids(ids)})", {"evidence_path": None}, prefer="return=minimal")


def _ids(ids: list[int | str]) -> str:
    return ",".join(urllib.parse.quote(str(i), safe="-") for i in ids)


def _ts(t: dt.datetime) -> str:
    return urllib.parse.quote(t.astimezone(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"))


@dataclass
class Policy:
    evidence_days: int = 730
    unmatched_days: int = 2


@dataclass
class Result:
    unmatched: int = 0
    evidence: int = 0

    def __str__(self) -> str:
        return f"{self.unmatched} unmatched samples and {self.evidence} play/mention clips deleted"


def _drain(store: Store, table: str, filters: str, delete_rows: bool) -> int:
    done = 0
    for _ in range(MAX_BATCHES):
        rows = store.old_rows(table, filters, BATCH)
        if not rows:
            break
        paths = [r["evidence_path"] for r in rows if r.get("evidence_path")]
        ids = [r["id"] for r in rows]
        store.delete_objects(paths)
        (store.delete_rows if delete_rows else store.clear_paths)(table, ids)
        done += len(rows)
        if len(rows) < BATCH:
            break
    return done


def run_once(store: Store, policy: Policy, now: dt.datetime | None = None) -> Result:
    now = now or dt.datetime.now(dt.timezone.utc)
    res = Result()
    if policy.unmatched_days > 0:
        cut = _ts(now - dt.timedelta(days=policy.unmatched_days))
        res.unmatched += _drain(store, "unmatched_clips", f"status=in.(open,discarded)&heard_at=lt.{cut}", delete_rows=True)
    if policy.evidence_days > 0:
        cut = _ts(now - dt.timedelta(days=policy.evidence_days))
        res.unmatched += _drain(store, "unmatched_clips", f"status=eq.matched&heard_at=lt.{cut}", delete_rows=True)
        res.evidence += _drain(store, "detections", f"evidence_path=not.is.null&detected_at=lt.{cut}", delete_rows=False)
        res.evidence += _drain(store, "mentions", f"evidence_path=not.is.null&heard_at=lt.{cut}", delete_rows=False)
    return res


class Retention(threading.Thread):
    def __init__(self, store: Store, policy: Policy, stop: threading.Event, every_hours: float = 6, first_delay_sec: float = 120):
        super().__init__(name="retention", daemon=True)
        self.store, self.policy, self.stop, self.every, self.first = store, policy, stop, every_hours * 3600, first_delay_sec

    def run(self) -> None:
        if self.stop.wait(self.first):
            return
        while True:
            try:
                res = run_once(self.store, self.policy)
                log.info("clip retention: %s", res)
            except Exception as e:  # never take the monitor down over housekeeping
                log.warning("clip retention failed: %s", e)
            if self.stop.wait(self.every):
                return
