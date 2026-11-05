"""A one-song catalogue must not 'hear' that song in unrelated radio.

    python -m tests.test_false_matches          (run from workers/ingest)

Today's live catalogue had a single learned song and the worker reported it on
stations that never played it (short, weak matches at random points in the
song). This rebuilds that situation: one learned song, then an hour-like
broadcast of other music, talk, a 14-second sting built from the song (shared
beat / jingle) and one real play. Only the real play may be reported.
"""
from __future__ import annotations

import datetime as dt
import sys
import tempfile
from pathlib import Path

import numpy as np

from eastsound_ingest.audio import decode_file
from eastsound_ingest.config import Settings, Station
from eastsound_ingest.detector import Detection, Detector
from eastsound_ingest.fingerprint import SAMPLE_RATE, landmarks
from eastsound_ingest.index import FingerprintIndex

from .synth import SR, degrade, song, talk, write_audio

FAILS: list[str] = []


def check(ok: bool, label: str) -> None:
    print(f"  {'✓' if ok else '✗'} {label}")
    if not ok:
        FAILS.append(label)


def detections(idx: FingerprintIndex, x: np.ndarray) -> list[Detection]:
    s = Settings()
    det = Detector(Station(slug="t", name="T FM"), idx, s)
    base = dt.datetime(2026, 1, 1, tzinfo=dt.timezone.utc)
    win, step = int(s.window_sec * SAMPLE_RATE), int(s.step_sec * SAMPLE_RATE)
    out: list = []
    for end in range(win, x.size + 1, step):
        out += det.step(x[end - win: end], end / SAMPLE_RATE, base)
    out += det.flush(base)
    return [d for d in out if isinstance(d, Detection)]


def main() -> int:
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        idx = FingerprintIndex(tmp / "one.db")
        master = song(7, 180)
        p = tmp / "master.wav"
        write_audio(master, p)
        x = decode_file(str(p))
        idx.enroll(landmarks(x), title="My Song", artist="Artist", duration_sec=x.size / SAMPLE_RATE, recording_id="rec-1")

        sting = master[int(40 * SR): int(54 * SR)]  # 14 s of the song used as a jingle
        parts = [talk(40, 1), song(101, 120), sting, talk(30, 2), song(102, 150), sting, song(103, 90),
                 talk(20, 3), master, talk(25, 4), song(104, 120)]
        starts = np.cumsum([0] + [q.size for q in parts])[:-1] / SR
        real_at = float(starts[8])
        mix = degrade(np.concatenate(parts).astype(np.float32), 5, talkover=False)
        bc = tmp / "bc.mp3"
        write_audio(mix, bc, ["-c:a", "libmp3lame", "-b:a", "64k"])
        found = detections(idx, decode_file(str(bc)))

    print("\nONE-SONG CATALOGUE")
    real = [d for d in found if abs((d.started_at - dt.datetime(2026, 1, 1, tzinfo=dt.timezone.utc)).total_seconds() - real_at) <= 3]
    check(len(real) == 1, f"the real play is found ({len(real)})")
    check(len(found) == len(real), f"nothing else is reported — the 14 s stings and other songs are ignored ({len(found) - len(real)} extra)")
    if real:
        check(real[0].duration_sec >= 170, f"the play covers the whole song ({real[0].duration_sec} s)")
    print(f"\n{'ALL FALSE-MATCH CHECKS PASSED' if not FAILS else f'{len(FAILS)} FAILED'}")
    return 1 if FAILS else 0


if __name__ == "__main__":
    sys.exit(main())
