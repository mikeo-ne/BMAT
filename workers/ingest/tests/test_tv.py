"""TV ingest test.

  python -m tests.test_tv            (run from workers/ingest)

A TV channel is a station row with kind="tv" and an HLS/RTMP URL. These checks
pin the parts that make that true without changing radio behaviour:

  1. kind   — defaults to "radio"; a CSV column sets it; is_tv follows
  2. hls    — ffmpeg gets live-edge flags for TV/.m3u8 and not for radio
  3. data   — the example TV file parses and stays out of the radio panel
"""
from __future__ import annotations

import sys
import tempfile
from pathlib import Path

from eastsound_ingest.audio import stream_command
from eastsound_ingest.config import Station, load_stations

HERE = Path(__file__).resolve().parent
TV_EXAMPLE = HERE.parent / "stations.tv.example.csv"

failures: list[str] = []


def check(ok: bool, label: str) -> None:
    print(("  ok   " if ok else "  FAIL ") + label)
    if not ok:
        failures.append(label)


def main() -> int:
    print("TV ingest")

    # 1. Kind ---------------------------------------------------------------
    radio = Station(slug="capital-fm", name="Capital FM")
    check(radio.kind == "radio", "a station defaults to radio")
    check(radio.is_tv is False, "default station is not TV")
    tv = Station(slug="nbs-tv", name="NBS TV", kind="tv")
    check(tv.is_tv is True, 'kind="tv" marks a television channel')

    with tempfile.TemporaryDirectory() as tmp:
        panel = Path(tmp) / "stations.csv"
        panel.write_text(
            "station,frequency,region,kind,stream_host,directory_status\n"
            "Capital FM,91.3,Central,radio,capitalfm.cloudrad.io,OK\n"
            "NBS TV,,Central,tv,https://example.invalid/nbs.m3u8,OK\n"
            "UBC TV,,Central,,https://example.invalid/ubc.m3u8,OK\n",
            encoding="utf-8",
        )
        rows = {s.name: s for s in load_stations(str(panel))}
        check(rows["Capital FM"].kind == "radio", "CSV kind=radio is parsed")
        check(rows["NBS TV"].is_tv, "CSV kind=tv is parsed")
        check(rows["UBC TV"].kind == "radio", "a missing kind defaults to radio (never silently TV)")

    # 2. HLS flags ----------------------------------------------------------
    radio_cmd = stream_command("https://stream.example/capital.mp3", "radio")
    check("-live_start_index" not in radio_cmd, "radio command has no HLS live-edge flags")
    check(radio_cmd.index("-i") > 0 and radio_cmd[radio_cmd.index("-i") + 1].endswith(".mp3"), "radio URL is still the input")

    tv_cmd = stream_command("https://stream.example/nbs.m3u8", "tv")
    check("-live_start_index" in tv_cmd and "-1" in tv_cmd, "TV command follows the live edge")
    check("-fflags" in tv_cmd and "+genpts" in tv_cmd, "TV command generates timestamps")
    check(tv_cmd.index("-i") < tv_cmd.index("-f"), "input comes before the output format")

    guess_cmd = stream_command("https://stream.example/ubc.m3u8", "radio")
    check("-live_start_index" in guess_cmd, "a .m3u8 URL gets HLS flags even if kind says radio")

    # 3. Example panel ------------------------------------------------------
    check(TV_EXAMPLE.exists(), "stations.tv.example.csv is present")
    if TV_EXAMPLE.exists():
        tv_stations = load_stations(str(TV_EXAMPLE))
        check(len(tv_stations) >= 1, f"example TV file parses ({len(tv_stations)} rows)")
        check(all(s.kind == "tv" for s in tv_stations), "every example row is kind=tv")
        # Placeholder rows deliberately carry no URL: we never invent a stream
        # address, and the worker reports no_stream_url instead of guessing.
        check(all(s.stream_url is None or s.stream_url.startswith("http") for s in tv_stations),
              "example URLs are either blank or a real http(s) address")

    if failures:
        print(f"\n{len(failures)} check(s) failed")
        return 1
    print("\nall checks passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
