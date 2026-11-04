"""Station panel test.

  python -m tests.test_panel            (run from workers/ingest)

Guards the panel of record: the ingest worker's stations.csv must stay a
byte-identical copy of the platform seed (supabase/seed/uganda_stream_stations.csv),
must parse through the real loader, and must keep the enable rules honest —
only stations whose stream was actually captured get monitored.

Checks, in order:
  1. drift      — workers/ingest/stations.csv == supabase/seed/uganda_stream_stations.csv
  2. parse      — every row becomes a Station with a name, frequency and region
  3. coverage   — the panel still carries every station we claimed to monitor
  4. enable     — "OK*" directory rows are on, "listed*" rows are off
  5. urls       — recorded stream hosts become URLs; bare hosts defer to Radio Browser
  6. regions    — parenthetical region notes collapse to a reporting region
"""
from __future__ import annotations

import csv
import sys
from pathlib import Path

from eastsound_ingest.config import Station, load_stations, slugify

HERE = Path(__file__).resolve().parent
WORKER_PANEL = HERE.parent / "stations.csv"
PLATFORM_PANEL = HERE.parents[2] / "supabase" / "seed" / "uganda_stream_stations.csv"

# The panel we agreed to run. Adding a station here is a deliberate act, which
# is the point: silent drift between the platform and the ingestor is a bug.
EXPECTED = [
    "Capital FM", "NRG Radio Uganda", "Pearl FM", "97 Radio City", "Beat FM",
    "Akaboozi FM", "Sanyu FM", "CBS FM Buganda", "KIIS Uganda",
    "Radio Maria Uganda", "Christ FM", "Radio Buddu", "RX Radio", "Bugwere FM",
]
EXPECTED_ENABLED = {
    "Capital FM", "NRG Radio Uganda", "Pearl FM", "97 Radio City",
    "Beat FM", "Akaboozi FM", "Sanyu FM",
}

checks = 0
failures: list[str] = []


def check(condition: bool, label: str) -> None:
    global checks
    checks += 1
    if condition:
        print(f"  ✓ {label}")
    else:
        print(f"  ✗ {label}")
        failures.append(label)


def main() -> int:
    print("Station panel")

    # 1. Drift guard -------------------------------------------------------
    check(WORKER_PANEL.exists(), "worker panel exists")
    check(PLATFORM_PANEL.exists(), "platform seed exists")
    same = WORKER_PANEL.read_bytes() == PLATFORM_PANEL.read_bytes()
    check(
        same,
        "worker panel is byte-identical to the platform seed"
        + ("" if same else " — regenerate: cp supabase/seed/uganda_stream_stations.csv workers/ingest/stations.csv"),
    )

    # 2. Parse -------------------------------------------------------------
    stations: list[Station] = load_stations(WORKER_PANEL)
    check(len(stations) > 0, f"loader parsed {len(stations)} stations")
    check(all(s.name for s in stations), "every station has a name")
    check(all(s.slug for s in stations), "every station has a slug")
    duplicates = len(stations) - len({s.slug for s in stations})
    check(duplicates == 0, f"slugs are unique ({duplicates} duplicates)")

    # 3. Coverage ----------------------------------------------------------
    names = {s.name for s in stations}
    missing = [n for n in EXPECTED if n not in names]
    check(not missing, f"panel carries all {len(EXPECTED)} expected stations" + (f" — missing {missing}" if missing else ""))
    # The two stations the platform added after the old worker file was written.
    check("RX Radio" in names, "RX Radio is wired into the ingestor")
    check("Bugwere FM" in names, "Bugwere FM is wired into the ingestor")
    check(
        any(s.region == "Eastern" for s in stations),
        "a non-Central region is represented (panel is no longer Kampala-only)",
    )

    # 4. Enable rules ------------------------------------------------------
    enabled = {s.name for s in stations if s.enabled}
    check(
        enabled == EXPECTED_ENABLED,
        f"exactly {len(EXPECTED_ENABLED)} stations are monitored"
        + ("" if enabled == EXPECTED_ENABLED else f" — got {sorted(enabled)}"),
    )
    with WORKER_PANEL.open(newline="") as f:
        rows = list(csv.DictReader(f))
    for row in rows:
        status = (row.get("directory_status") or "").strip().lower()
        station = next(s for s in stations if s.name == row["station"])
        if status.startswith("ok"):
            check(station.enabled, f"{station.name} has a captured stream and is monitored")
    for row in rows:
        status = (row.get("directory_status") or "").strip().lower()
        if status.startswith("listed"):
            station = next(s for s in stations if s.name == row["station"])
            check(not station.enabled, f"{station.name} has no captured stream and stays idle")

    # 5. Stream URLs -------------------------------------------------------
    pearl = next((s for s in stations if s.name == "Pearl FM"), None)
    check(pearl is not None and pearl.stream_url == "https://dc4.serverse.com/proxy/pearlfm/stream",
          "Pearl FM's recorded stream host becomes an explicit URL")
    check(all(s.stream_url is None or s.stream_url.startswith(("http://", "https://"))
              for s in stations),
          "every explicit stream URL is absolute")
    capital = next((s for s in stations if s.name == "Capital FM"), None)
    check(capital is not None and capital.stream_url is None,
          "a bare host defers to Radio Browser rather than guessing a path")

    # 6. Regions -----------------------------------------------------------
    buddu = next((s for s in stations if s.name == "Radio Buddu"), None)
    check(buddu is not None and buddu.region == "Central",
          "a parenthetical region note collapses to the reporting region")
    check(all(s.region in {"Central", "Eastern", "Western", "Northern"} for s in stations),
          "every region is one of the four reporting regions")

    # Loader sanity: slugs match the platform's URL convention.
    check(slugify("97 Radio City 97.0") == "97-radio-city-97-0", "slugify is stable")

    print(f"\n{checks - len(failures)}/{checks} checks passed")
    for failure in failures:
        print("  ✗", failure)
    return 0 if not failures else 1


if __name__ == "__main__":
    sys.exit(main())
