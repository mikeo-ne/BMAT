"""Stream-error diagnostics test.

  python -m tests.test_stream_errors      (run from workers/ingest)

When a station cannot be read, the panel used to say "reconnecting" forever and
the reason lived only in the host's log tail. The worker now keeps the sentence
ffmpeg printed and ships it with the heartbeat, so the broadcaster dashboard and
/api/health can both explain the silence.
"""
from __future__ import annotations

import datetime as dt
import json
import sys
import tempfile
from pathlib import Path

from eastsound_ingest.config import Station
from eastsound_ingest.monitor import _short_error
from eastsound_ingest.sinks import JsonlSink

failures: list[str] = []


def check(ok: bool, label: str) -> None:
    print(("  ok   " if ok else "  FAIL ") + label)
    if not ok:
        failures.append(label)


class FakeSupabaseSink:
    """Captures the payload the SupabaseSink would PATCH, without the network."""

    def __init__(self) -> None:
        self.calls: list[tuple[str, dict]] = []

    def _rest(self, method: str, table: str, rows, query: str = "", prefer: str = "return=minimal"):
        self.calls.append((f"{method} {table}{query}", rows))
        return None

    def _station_id(self, st: Station, stream_url: str | None = None) -> str:
        return "11111111-1111-4111-8111-111111111111"


def main() -> int:
    print("Stream errors")

    # 1. The sentence, not the banner ---------------------------------------
    stderr = "\n".join([
        "ffmpeg version 6.1 Copyright (c) 2000-2023 the FFmpeg developers",
        "  built with gcc 12",
        "[https @ 0x55d] HTTP error 403 Forbidden",
        "[in#0 @ 0x55d] Error opening input: Server returned 403 Forbidden (access denied)",
        "Error opening input file https://example.test/stream.mp3.",
        "Error opening input files: Server returned 403 Forbidden (access denied)",
    ])
    short = _short_error(stderr)
    check("ffmpeg version" not in short and "built with" not in short, "banner lines are dropped")
    check("403 Forbidden" in short, "the last real error line is kept")
    check(len(short) <= 300 and "\n" not in short, "it stays one short line")
    check(_short_error("") == "stream ended", "an empty stderr still says something")

    # An ingest URL can carry a token; this text is shown in a dashboard and
    # part of it is public on /api/health.
    leaky = "Error opening input file https://user:secret@radio.example.ug/live?token=abc123."
    cleaned = _short_error(leaky)
    check("http" not in cleaned and "secret" not in cleaned and "token=" not in cleaned, "the stream address is not echoed")
    check(cleaned.startswith("Error opening input file <stream>"), "the reason survives the redaction")

    # 2. The heartbeat carries it to the database ---------------------------
    st = Station(slug="capital-fm", name="Capital FM")
    sink = FakeSupabaseSink()
    from eastsound_ingest.sinks import SupabaseSink  # noqa: PLC0415  (kept local: importing is cheap)

    SupabaseSink.heartbeat(sink, st, "reconnecting", None, st.stream_url or "https://example.test/a", "Connection refused")
    (call, row) = sink.calls[-1]
    check(call.startswith("PATCH stations?id=eq."), "the PATCH goes to stations")
    check(row.get("stream_status") == "reconnecting", "status is what the dashboard shows")
    check(row.get("stream_error") == "Connection refused", "the error is stored")
    check(isinstance(row.get("stream_error_at"), str), "and timestamped")
    check(isinstance(row.get("last_heartbeat"), str), "the heartbeat still stamps the time")

    sink.calls.clear()
    SupabaseSink.heartbeat(sink, st, "online", "A — B", "https://example.test/a", None)
    (_, row) = sink.calls[-1]
    check(row.get("stream_error") is None, "a healthy beat clears the error")
    check("stream_error_at" not in row, "…and does not re-stamp the error time")

    # 3. The dry-run sink records it too ------------------------------------
    with tempfile.TemporaryDirectory() as d:
        out = JsonlSink(d)
        out.heartbeat(st, "reconnecting", None, "https://example.test/a", "Connection refused")
        lines = (Path(d) / "heartbeats.jsonl").read_text().strip().splitlines()
        row = json.loads(lines[-1])
        check(row.get("error") == "Connection refused", "dry-run heartbeats include the error")
        check(row.get("station") == "capital-fm" and row.get("status") == "reconnecting", "…and the usual fields")
        check(dt.datetime.fromisoformat(row["at"]).tzinfo is not None, "…with a real UTC timestamp")

    if failures:
        print(f"\n{len(failures)} check(s) failed")
        return 1
    print("\nall checks passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
