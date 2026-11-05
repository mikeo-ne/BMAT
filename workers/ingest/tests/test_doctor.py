"""Pre-flight (`doctor`) test.

  python -m tests.test_doctor          (run from workers/ingest)

The doctor command is what tells an operator whether a fresh Railway/Fly deploy
is actually feeding the dashboards. It must be honest in both directions: never
green when the worker would silently do nothing, never red over a warning that
is fine for a dry run.

Checks, in order:
  1. healthy   — a fully wired worker reports no failures and no warnings
  2. ffmpeg    — missing ffmpeg blocks (nothing can be decoded)
  3. dry-run   — no sink is a warning, not a failure (valid for testing)
  4. creds     — short/absent service-role key blocks when the sink needs it
  5. schema    — an HTTP error from PostgREST points at the migrations
  6. network   — an unreachable project is reported, not raised
  7. bucket    — a missing evidence bucket names migration 0002
  8. stations  — a panel with nothing enabled blocks
  9. index     — an empty fingerprint index only warns
 10. exit      — main() exits 1 only when something blocking is wrong
"""
from __future__ import annotations

import sys
from pathlib import Path

from eastsound_ingest.config import Settings, Station
from eastsound_ingest.doctor import FAIL, OK, WARN, main, render, run_checks

FAILS: list[str] = []


def check(label: str, got, want) -> None:
    ok = got == want
    print(f"  {'✓' if ok else '✗'} {label:52} {str(got)[:28]:>28}{'' if ok else f'  (expected {want})'}")
    if not ok:
        FAILS.append(label)


def settings(**over) -> Settings:
    s = Settings(
        supabase_url="https://demo.supabase.co",
        supabase_service_key="k" * 60,
        stations=[Station(slug="capital-fm", name="Capital FM", stream_url="https://x/y")],
    )
    for k, v in over.items():
        setattr(s, k, v)
    return s


def getter(status: int = 200, body: bytes = b"[]"):
    def get(url, headers, timeout=10.0):  # noqa: ANN001
        if "bucket" in url and status == 200:
            return 200, b'{"id":"evidence"}'
        return status, body

    return get


def state(checks, label: str) -> str:  # noqa: ANN001
    for c in checks:
        if c.label == label:
            return c.state
    return "missing"


def main_() -> int:  # noqa: ANN001
    good = lambda **kw: run_checks(settings(**kw), get=getter(), which=lambda _: "/usr/bin/ffmpeg")

    print("\ndoctor — healthy worker")
    checks = good(index_path=str(Path("/tmp/nonexistent-index.db")))
    check("no failures", [c.state for c in checks].count(FAIL), 0)
    check("database ok", state(checks, "Database"), OK)
    check("bucket ok", state(checks, "Evidence bucket"), OK)
    check("sink ok", state(checks, "Output sink"), OK)
    check("empty index warns", state(checks, "Fingerprint index"), WARN)

    print("\ndoctor — ffmpeg missing")
    checks = run_checks(settings(), get=getter(), which=lambda _: None)
    check("ffmpeg blocks", state(checks, "ffmpeg"), FAIL)
    check("ffmpeg fix mentions docker", "Docker" in (checks[0].fix or ""), True)

    print("\ndoctor — dry run")
    checks = run_checks(settings(supabase_url="", supabase_service_key=""), get=getter(), which=lambda _: "/f")
    check("sink warns, not fails", state(checks, "Output sink"), WARN)
    check("database skipped", state(checks, "Database"), WARN)
    check("no blocking problem", [c.state for c in checks].count(FAIL), 0)

    print("\ndoctor — service-role key too short")
    checks = run_checks(settings(supabase_service_key="short"), get=getter(), which=lambda _: "/f")
    check("key blocks", state(checks, "Service-role key"), FAIL)

    print("\ndoctor — non-HTTPS project URL")
    checks = run_checks(settings(supabase_url="http://demo"), get=getter(), which=lambda _: "/f")
    check("url blocks", state(checks, "Project URL"), FAIL)

    print("\ndoctor — schema not installed")
    body = b'{"message":"relation \\"public.stations\\" does not exist","code":"42P01"}'
    checks = run_checks(settings(), get=getter(status=404, body=body), which=lambda _: "/f")
    check("database blocks", state(checks, "Database"), FAIL)
    check("fix names setup.sql", "setup.sql" in (next(c for c in checks if c.label == "Database").fix or ""), True)
    check("error surfaces the message", "does not exist" in next(c for c in checks if c.label == "Database").detail, True)

    print("\ndoctor — project unreachable")

    def boom(url, headers, timeout=10.0):  # noqa: ANN001
        raise RuntimeError("URLError: connection refused")

    checks = run_checks(settings(), get=boom, which=lambda _: "/f")
    check("database reported, not raised", state(checks, "Database"), FAIL)
    check("detail carries the cause", "connection refused" in next(c for c in checks if c.label == "Database").detail, True)

    print("\ndoctor — evidence bucket missing")
    checks = run_checks(settings(), get=getter(status=404), which=lambda _: "/f")
    check("bucket blocks", state(checks, "Evidence bucket"), FAIL)
    check("fix names migration 0002", "0002" in next(c for c in checks if c.label == "Evidence bucket").fix, True)

    print("\ndoctor — station panel with nothing enabled")
    checks = run_checks(
        settings(stations=[Station(slug="a", name="A", enabled=False)]),
        get=getter(), which=lambda _: "/f",
    )
    check("panel blocks", state(checks, "Station panel"), FAIL)

    print("\ndoctor — station panel empty")
    checks = run_checks(settings(stations=[]), get=getter(), which=lambda _: "/f")
    check("empty panel blocks", state(checks, "Station panel"), FAIL)

    print("\ndoctor — exit codes")
    import io
    import contextlib

    out = io.StringIO()
    with contextlib.redirect_stdout(out):
        code = main(settings(supabase_service_key="short"))
    check("blocking → exit 1", code, 1)
    check("says blocking", "blocking problem" in out.getvalue(), True)

    # A dry run is a legitimate state: without ffmpeg it still blocks, but the
    # sink/key/database checks must not.
    dry = run_checks(settings(supabase_url="", supabase_service_key=""), get=getter(), which=lambda _: "/f")
    check("dry run has no blocking checks", [c.label for c in dry if c.state == FAIL], [])
    out = io.StringIO()
    with contextlib.redirect_stdout(out):
        main(settings(supabase_url="", supabase_service_key=""))
    check("always prints a verdict", any(
        v in out.getvalue() for v in ("blocking problem", "warning", "All clear")), True)

    print("\ndoctor — rendering")
    text = render([c for c in run_checks(settings(), get=getter(), which=lambda _: "/f")])
    check("marks every line", text.count("✓") + text.count("!") + text.count("✗"), 7)
    check("indents fixes", "    → " in text, True)

    print(f"\n{'ALL CHECKS PASSED' if not FAILS else f'{len(FAILS)} FAILED: ' + '; '.join(FAILS)}")
    return 1 if FAILS else 0


if __name__ == "__main__":
    sys.exit(main_())
