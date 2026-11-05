"""Songs uploaded in the dashboards are learned and then recognised on air.

The browser uploads a mono 11 kHz WAV reference copy (see lib/audio.ts
makeReference). This test builds the same kind of file, runs the sync pass
against a fake database/storage, and checks that a degraded broadcast clip of
the song is then matched to the right recording id — plus the failure paths
an uploader sees.

    python -m tests.test_masters
"""
from __future__ import annotations

import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np

from eastsound_ingest.audio import decode_file
from eastsound_ingest.fingerprint import SAMPLE_RATE, landmarks
from eastsound_ingest.index import FingerprintIndex
from eastsound_ingest.masters import MIN_SECONDS, Pending, enroll_pending

from .synth import SR, degrade, song, write_audio

FAILS: list[str] = []


def check(ok: bool, label: str) -> None:
    print(f"  {'✓' if ok else '✗'} {label}")
    if not ok:
        FAILS.append(label)


class FakeSource:
    """Stands in for PostgREST + Storage: paths map to local files."""

    def __init__(self, rows: list[Pending], files: dict[str, Path], fail_mark: bool = False):
        self.rows, self.files, self.fail_mark = rows, files, fail_mark
        self.marks: dict[str, dict] = {}

    def pending(self, limit: int = 20) -> list[Pending]:
        done = {k for k, v in self.marks.items() if v.get("enrolled_at") or v.get("error")}
        return [r for r in self.rows if r.id not in done][:limit]

    def signed_url(self, path: str, seconds: int = 600) -> str:
        if path not in self.files:
            raise RuntimeError("HTTP Error 404: Object not found")
        return str(self.files[path])

    def mark(self, rec_id: str, *, enrolled_at=None, error=None, duration=None) -> None:
        if self.fail_mark:
            raise OSError("network down")
        self.marks[rec_id] = {"enrolled_at": enrolled_at, "error": error, "duration": duration}


def browser_reference(x: np.ndarray, path: Path) -> None:
    """Mono 16-bit WAV at the worker's rate — what the dashboard uploads."""
    raw = path.with_suffix(".src.wav")
    write_audio(x, raw)
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", str(raw), "-ac", "1", "-ar", str(SAMPLE_RATE),
                    "-c:a", "pcm_s16le", str(path)], check=True)


def main() -> int:
    with tempfile.TemporaryDirectory() as d:
        tmp = Path(d)
        idx = FingerprintIndex(tmp / "idx.db")
        files: dict[str, Path] = {}
        rows: list[Pending] = []
        for i, rid in enumerate(["11111111-1111-1111-1111-111111111111", "22222222-2222-2222-2222-222222222222"]):
            p = tmp / f"{rid}.wav"
            browser_reference(song(40 + i), p)
            files[f"{rid}/reference.wav"] = p
            rows.append(Pending(rid, f"Uploaded {i}", "Artist", None, f"{rid}/reference.wav"))
        short = tmp / "short.wav"
        browser_reference(song(50)[: int(5 * SR)], short)
        files["33333333-3333-3333-3333-333333333333/reference.wav"] = short
        rows.append(Pending("33333333-3333-3333-3333-333333333333", "Snippet", "Artist", None, "33333333-3333-3333-3333-333333333333/reference.wav"))
        junk = tmp / "junk.wav"
        junk.write_bytes(b"not audio at all" * 100)
        files["44444444-4444-4444-4444-444444444444/reference.wav"] = junk
        rows.append(Pending("44444444-4444-4444-4444-444444444444", "Broken", "Artist", None, "44444444-4444-4444-4444-444444444444/reference.wav"))
        rows.append(Pending("55555555-5555-5555-5555-555555555555", "Missing", "Artist", None, "55555555-5555-5555-5555-555555555555/reference.wav"))

        src = FakeSource(rows, files)
        ok, failed = enroll_pending(src, idx, lambda: "2026-11-05T09:00:00+00:00")
        print("\nSYNC PASS")
        check(ok == 2 and failed == 3, f"2 songs learned, 3 refused ({ok} learned, {failed} failed)")
        check(len(idx.tracks) == 2, "only the good uploads are in the index")
        check(all(src.marks[r.id]["enrolled_at"] for r in rows[:2]), "learned songs are marked enrolled")
        check(src.marks[rows[0].id]["duration"] in range(85, 95), f"duration saved ({src.marks[rows[0].id]['duration']} s)")
        check(f"{MIN_SECONDS}" not in (src.marks[rows[2].id]["error"] or "") and "only 5 seconds" in (src.marks[rows[2].id]["error"] or ""),
              f"a snippet gets a plain error: {src.marks[rows[2].id]['error']}")
        check("couldn't be read" in (src.marks[rows[3].id]["error"] or ""), f"a broken file gets a plain error: {src.marks[rows[3].id]['error']}")
        check("missing" in (src.marks[rows[4].id]["error"] or ""), f"a missing file gets a plain error: {src.marks[rows[4].id]['error']}")

        print("\nRECOGNISED ON AIR")
        clip = tmp / "air.mp3"
        x = degrade(song(41), 7, talkover=True)[int(30 * SR): int(42 * SR)]
        write_audio(x, clip, ["-c:a", "libmp3lame", "-b:a", "64k"])
        m = idx.match(landmarks(decode_file(str(clip))))
        check(m is not None and m.track.recording_id == rows[1].id, "a 12 s broadcast clip matches the uploaded recording id")
        check(m is not None and 25 <= m.track_offset_sec <= 35, f"…at the right point in the song ({m.track_offset_sec if m else '—'} s)")

        print("\nRE-UPLOAD AND RESILIENCE")
        browser_reference(song(60), files[rows[0].path])  # user replaces the audio
        src2 = FakeSource([rows[0]], files)
        enroll_pending(src2, idx, lambda: "2026-11-05T10:00:00+00:00")
        check(len(idx.tracks) == 2, "replacing the audio re-learns the song without duplicating it")
        clip2 = tmp / "air2.mp3"
        write_audio(degrade(song(60), 3)[int(20 * SR): int(32 * SR)], clip2, ["-c:a", "libmp3lame", "-b:a", "64k"])
        m2 = idx.match(landmarks(decode_file(str(clip2))))
        check(m2 is not None and m2.track.recording_id == rows[0].id, "the new audio is what gets recognised")
        src3 = FakeSource([Pending("66666666-6666-6666-6666-666666666666", "x", "y", None, rows[1].path)], files, fail_mark=True)
        try:
            enroll_pending(src3, idx, lambda: "t")
            check(True, "a network failure while saving status doesn't crash the worker")
        except Exception as e:
            check(False, f"network failure crashed the pass: {e}")

    print(f"\n{'ALL MASTER CHECKS PASSED' if not FAILS else f'{len(FAILS)} FAILED'}")
    return 1 if FAILS else 0


if __name__ == "__main__":
    sys.exit(main())
