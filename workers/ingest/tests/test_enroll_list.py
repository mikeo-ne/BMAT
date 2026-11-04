"""Manifest enrolment test.

  python -m tests.test_enroll_list        (run from workers/ingest, needs ffmpeg)

`enroll-list` is how masters reach a worker that has no shared filesystem with
the person who owns them: a manifest of URLs (a bucket, a signed link) or local
paths, one per line. The test runs the real command against real WAV files, so
it covers the parts that used to bite us by hand: naming, duplicate handling,
one dead link not killing the batch, and the exit code a script would see.

Checks, in order:
  1. names      — "Artist - Title" parsing, including files with no dash
  2. urls       — the file name is recovered from a percent-encoded URL
  3. comments   — blank lines and `#` lines are skipped, not enrolled
  4. enrol      — a mixed manifest (paths + metadata override) fills the index
  5. duplicates — the same master twice adds one recording, not two
  6. bad entry  — a missing file is reported, the rest still enrol
  7. empty      — an empty manifest fails loudly instead of silently doing nothing
  8. all bad    — if nothing could be enrolled the command exits non-zero
  9. missing    — a manifest that does not exist exits 2
 10. metadata   — a tab-separated "Artist - Title" beats the file name
"""
from __future__ import annotations

import io
import shutil
import sys
import tempfile
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path
from types import SimpleNamespace

from eastsound_ingest.__main__ import _master_name, _split_master, cmd_enroll_list
from eastsound_ingest.config import load_settings
from eastsound_ingest.index import FingerprintIndex
from tests.synth import song, write_audio

checks = 0
failures: list[str] = []


def check(label: str, got, want=True) -> None:
    global checks
    checks += 1
    ok = got == want
    print(f"  {'✓' if ok else '✗'} {label:58} {got if not ok else ''}".rstrip())
    if not ok:
        failures.append(f"{label} (got {got!r}, wanted {want!r})")


def run(manifest: Path, index: Path) -> tuple[int, str, str]:
    """Run the real subcommand and capture what an operator would see."""
    args = SimpleNamespace(manifest=str(manifest))
    settings = load_settings(None)
    settings.index_path = str(index)
    out, err = io.StringIO(), io.StringIO()
    code = 0
    try:
        with redirect_stdout(out), redirect_stderr(err):
            cmd_enroll_list(args, settings)
    except SystemExit as e:
        code = int(e.code or 0)
    return code, out.getvalue(), err.getvalue()


def main() -> int:
    tmp = Path(tempfile.mkdtemp(prefix="est-enroll-list-"))
    try:
        # 1. Names ---------------------------------------------------------
        check("'Artist - Title' splits", _split_master("Jovan - Kampala Nights"), ("Jovan", "Kampala Nights"))
        check("a bare file name keeps its stem as the title", _split_master("Untitled Master"), ("Unknown", "Untitled Master"))

        # 2. URLs ----------------------------------------------------------
        check("a percent-encoded URL yields the master name",
              _master_name("https://bucket.example.com/masters/Jovan%20-%20Kampala%20Nights.mp3?token=abc"),
              "Jovan - Kampala Nights")

        # Real audio for the rest.
        masters = tmp / "masters"
        masters.mkdir()
        write_audio(song(0, seconds=6), masters / "Jovan - Kampala Nights.wav")
        write_audio(song(1, seconds=6), masters / "Nile Breeze.wav")

        # 3. Comments + 4. enrolment --------------------------------------
        manifest = tmp / "masters.txt"
        manifest.write_text(
            "# Ugandan masters\n"
            "\n"
            f"{masters / 'Jovan - Kampala Nights.wav'}\n"
            f"{masters / 'Nile Breeze.wav'}\tAma - Nile Breeze\n",
            encoding="utf-8",
        )
        index = tmp / "fp.db"
        code, out, _ = run(manifest, index)
        idx = FingerprintIndex(str(index))
        check("a mixed manifest exits 0", code, 0)
        check("both masters are in the index", len(idx.tracks), 2)
        check("the tab-separated artist wins", sorted(t.artist for t in idx.tracks), ["Ama", "Jovan"])
        check("the tab-separated title wins", "Nile Breeze" in [t.title for t in idx.tracks])
        check("no comment line was enrolled", "# Ugandan masters" in out, False)

        # 5. Duplicates ----------------------------------------------------
        code, out, _ = run(manifest, index)
        check("re-running the same manifest adds nothing", len(FingerprintIndex(str(index)).tracks), 2)
        check("the summary reports the index size", "2 recordings in index" in out)

        # 6. A bad entry does not stop the batch --------------------------
        mixed = tmp / "mixed.txt"
        mixed.write_text(
            f"{masters / 'Jovan - Kampala Nights.wav'}\n"
            f"{tmp / 'does-not-exist.wav'}\n",
            encoding="utf-8",
        )
        code, out, err = run(mixed, index)
        check("a missing file is a warning, not a crash", code, 0)
        check("the failure is named on stderr", "does-not-exist.wav" in err)
        check("the good entry still enrolled", "1 enrolled, 1 failed" in out)

        # 7. Empty manifest -------------------------------------------------
        empty = tmp / "empty.txt"
        empty.write_text("# nothing yet\n\n", encoding="utf-8")
        code, _, err = run(empty, index)
        check("an empty manifest exits 2", code, 2)
        check("and says why", "no entries" in err)

        # 8. Everything failed ----------------------------------------------
        broken = tmp / "broken.txt"
        broken.write_text(f"{tmp / 'one.wav'}\n{tmp / 'two.wav'}\n", encoding="utf-8")
        code, _, _ = run(broken, index)
        check("nothing enrolled exits 1", code, 1)

        # 9. Manifest missing ------------------------------------------------
        code, _, err = run(tmp / "nope.txt", index)
        check("a missing manifest exits 2", code, 2)
        check("and names the path", "manifest not found" in err)

        # 10. Duration is measured, not guessed ------------------------------
        first = next(t for t in FingerprintIndex(str(index)).tracks if t.artist == "Jovan")
        check("duration comes from the decoded audio", first.duration_sec > 0)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    print(f"\n{checks - len(failures)}/{checks} checks passed")
    for failure in failures:
        print("  ✗", failure)
    return 0 if not failures else 1


if __name__ == "__main__":
    sys.exit(main())
