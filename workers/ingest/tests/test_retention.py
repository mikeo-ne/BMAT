import datetime as dt
import threading
import urllib.parse

from eastsound_ingest import retention
from eastsound_ingest.config import load_settings
from eastsound_ingest.retention import Policy, Retention, run_once


class FakeStore:
    """In-memory tables; filters understood: status, time cutoff, evidence_path not null."""

    def __init__(self, tables):
        self.tables = tables
        self.deleted_objects: list[str] = []
        self.calls: list[str] = []

    def _match(self, table, row, filters):
        f = dict(p.split("=", 1) for p in filters.split("&"))
        for col in ("heard_at", "detected_at"):
            if col in f:
                cut = dt.datetime.strptime(urllib.parse.unquote(f[col][3:]), "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=dt.timezone.utc)
                if not row[col] < cut:
                    return False
        if "status" in f:
            s = f["status"]
            allowed = s[4:-1].split(",") if s.startswith("in.(") else [s[3:]]
            if row["status"] not in allowed:
                return False
        if f.get("evidence_path") == "not.is.null" and not row.get("evidence_path"):
            return False
        return True

    def old_rows(self, table, filters, limit):
        self.calls.append(f"GET {table}")
        return [r for r in self.tables[table] if self._match(table, r, filters)][:limit]

    def delete_objects(self, paths):
        self.calls.append("DELETE storage")
        self.deleted_objects += paths

    def delete_rows(self, table, ids):
        self.calls.append(f"DELETE {table}")
        self.tables[table] = [r for r in self.tables[table] if r["id"] not in ids]

    def clear_paths(self, table, ids):
        self.calls.append(f"PATCH {table}")
        for r in self.tables[table]:
            if r["id"] in ids:
                r["evidence_path"] = None


NOW = dt.datetime(2026, 11, 12, 12, tzinfo=dt.timezone.utc)


def ago(days):
    return NOW - dt.timedelta(days=days)


def store():
    return FakeStore({
        "unmatched_clips": [
            {"id": 1, "heard_at": ago(3), "status": "open", "evidence_path": "unmatched/a/1.mp3"},
            {"id": 2, "heard_at": ago(1), "status": "open", "evidence_path": "unmatched/a/2.mp3"},
            {"id": 3, "heard_at": ago(5), "status": "discarded", "evidence_path": "unmatched/a/3.mp3"},
            {"id": 4, "heard_at": ago(5), "status": "matched", "evidence_path": "unmatched/a/4.mp3"},
            {"id": 5, "heard_at": ago(800), "status": "matched", "evidence_path": "unmatched/a/5.mp3"},
        ],
        "detections": [
            {"id": "d-old", "detected_at": ago(731), "evidence_path": "stations/x/old.mp3"},
            {"id": "d-new", "detected_at": ago(10), "evidence_path": "stations/x/new.mp3"},
            {"id": "d-gone", "detected_at": ago(900), "evidence_path": None},
        ],
        "mentions": [
            {"id": 7, "heard_at": ago(740), "evidence_path": "mentions/x/7.mp3"},
        ],
    })


def test_deletes_only_what_the_policy_allows():
    s = store()
    res = run_once(s, Policy(evidence_days=730, unmatched_days=2), now=NOW)
    assert sorted(r["id"] for r in s.tables["unmatched_clips"]) == [2, 4]  # recent, and matched (evidence)
    det = {r["id"]: r["evidence_path"] for r in s.tables["detections"]}
    assert det == {"d-old": None, "d-new": "stations/x/new.mp3", "d-gone": None}  # plays kept, old clip gone
    assert s.tables["mentions"][0]["evidence_path"] is None
    assert sorted(s.deleted_objects) == sorted([
        "unmatched/a/1.mp3", "unmatched/a/3.mp3", "unmatched/a/5.mp3", "stations/x/old.mp3", "mentions/x/7.mp3"])
    assert res.unmatched == 3 and res.evidence == 2


def test_storage_is_deleted_before_rows():
    s = store()
    run_once(s, Policy(), now=NOW)
    first_db_write = next(i for i, c in enumerate(s.calls) if c.startswith(("DELETE unmatched", "PATCH")))
    assert s.calls[first_db_write - 1] == "DELETE storage"


def test_zero_switches_a_part_off():
    s = store()
    run_once(s, Policy(evidence_days=0, unmatched_days=0), now=NOW)
    assert s.deleted_objects == [] and len(s.tables["unmatched_clips"]) == 5


def test_large_backlog_is_batched(monkeypatch):
    monkeypatch.setattr(retention, "BATCH", 3)
    rows = [{"id": i, "heard_at": ago(10), "status": "open", "evidence_path": f"u/{i}.mp3"} for i in range(10)]
    s = FakeStore({"unmatched_clips": rows, "detections": [], "mentions": []})
    res = run_once(s, Policy(), now=NOW)
    assert res.unmatched == 10 and s.tables["unmatched_clips"] == []
    assert s.calls.count("DELETE storage") == 4


def test_failure_does_not_kill_the_thread():
    class Broken:
        def old_rows(self, *a):
            raise OSError("network down")
    stop = threading.Event()
    t = Retention(Broken(), Policy(), stop, every_hours=1, first_delay_sec=0)
    t.start()
    stop.set()
    t.join(2)
    assert not t.is_alive()


def test_settings_from_env(monkeypatch):
    monkeypatch.setenv("EST_UNMATCHED_RETENTION_DAYS", "5")
    monkeypatch.setenv("EST_EVIDENCE_RETENTION_DAYS", "0")
    s = load_settings(None)
    assert s.unmatched_retention_days == 5 and s.evidence_retention_days == 0
    monkeypatch.delenv("EST_UNMATCHED_RETENTION_DAYS")
    assert load_settings(None).unmatched_retention_days == 2


def test_supabase_store_requests(monkeypatch):
    sent = []

    class Resp:
        def __enter__(self): return self
        def __exit__(self, *a): return False
        def read(self): return b""

    def fake_open(req, timeout):
        sent.append((req.get_method(), req.full_url, req.data))
        return Resp()

    monkeypatch.setattr(retention.urllib.request, "urlopen", fake_open)
    st = retention.SupabaseStore("https://x.supabase.co/", "k", "evidence")
    st.delete_objects(["a/1.mp3"])
    st.delete_rows("unmatched_clips", [1, 2])
    st.clear_paths("detections", ["9f1c-aa"])
    assert sent[0] == ("DELETE", "https://x.supabase.co/storage/v1/object/evidence", b'{"prefixes": ["a/1.mp3"]}')
    assert sent[1][:2] == ("DELETE", "https://x.supabase.co/rest/v1/unmatched_clips?id=in.(1,2)")
    assert sent[2] == ("PATCH", "https://x.supabase.co/rest/v1/detections?id=in.(9f1c-aa)", b'{"evidence_path": null}')


class _MonkeyPatch:
    """Just enough of pytest's monkeypatch to run these checks with plain `python -m`."""

    def __init__(self):
        self._undo = []

    def setattr(self, obj, name, value):
        self._undo.append(lambda o=obj, n=name, v=getattr(obj, name): setattr(o, n, v))
        setattr(obj, name, value)

    def setenv(self, k, v):
        import os
        old = os.environ.get(k)
        self._undo.append(lambda: os.environ.__setitem__(k, old) if old is not None else os.environ.pop(k, None))
        os.environ[k] = v

    def delenv(self, k):
        import os
        old = os.environ.pop(k, None)
        self._undo.append(lambda: os.environ.__setitem__(k, old) if old is not None else None)

    def undo(self):
        for f in reversed(self._undo):
            f()


def main() -> int:
    import inspect
    import sys
    failed = 0
    for name, fn in list(globals().items()):
        if not name.startswith("test_") or not callable(fn):
            continue
        mp = _MonkeyPatch()
        try:
            fn(mp) if "monkeypatch" in inspect.signature(fn).parameters else fn()
            print(f"  ✓ {name}")
        except Exception as e:
            failed += 1
            print(f"  ✗ {name}: {e!r}", file=sys.stderr)
        finally:
            mp.undo()
    print("\nall checks passed" if not failed else f"\n{failed} check(s) failed")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
