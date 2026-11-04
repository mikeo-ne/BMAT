"""End-to-end accuracy test on a simulated, degraded broadcast.

  python -m tests.test_broadcast            (run from workers/ingest)

Builds 20 catalogue songs + unknown songs + talk, degrades the mix like real
radio (EQ, limiter, hiss, presenter over an intro, 64 kbps MP3), runs the
detector and compares every play against ground truth.
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

TOLERANCE_SEC = 3.0
CATALOGUE = 20


def build(tmp: Path) -> tuple[FingerprintIndex, Path, list[tuple[str, float, float]]]:
    idx = FingerprintIndex(tmp / "idx.db")
    for i in range(CATALOGUE):
        p = tmp / f"m{i}.wav"
        write_audio(song(i), p)
        x = decode_file(str(p))
        idx.enroll(landmarks(x), title=f"Song {i}", artist="Test", duration_sec=x.size / SAMPLE_RATE, recording_id=f"rec-{i}")

    plan = [("talk", None, 25), ("song", 3), ("talk", None, 12), ("ad", 101, 30), ("song", 7),
            ("talkover", 12), ("ad", 102, 20), ("song", 15), ("song", 15), ("talk", None, 40),
            ("unknown", 103, 90), ("song", 0), ("talk", None, 10), ("song", 19), ("fadeout", 5, 45)]
    parts, truth, t = [], [], 0.0
    for kind, arg, *rest in plan:
        secs = rest[0] if rest else None
        if kind == "talk":
            x = talk(secs, int(t))
        elif kind in ("ad", "unknown"):
            x = song(arg)[: int(secs * SR)]
        else:
            x = song(arg)
            if kind == "talkover":
                x = degrade(x, 1, talkover=True) / 0.7
            if kind == "fadeout":  # DJ fades the song out early
                x = x[: int(secs * SR)] * np.linspace(1, 0, int(secs * SR)) ** 0.5
            truth.append((f"Song {arg}", t, t + x.size / SR))
        parts.append(x.astype(np.float32))
        t += x.size / SR
    mix = degrade(np.concatenate(parts), 99, talkover=False)
    bc = tmp / "broadcast.mp3"
    write_audio(mix, bc, ["-c:a", "libmp3lame", "-b:a", "64k"])
    return idx, bc, truth


def run_detector(idx: FingerprintIndex, path: Path) -> list[Detection]:
    s = Settings()
    det = Detector(Station(slug="test", name="Test FM"), idx, s)
    x = decode_file(str(path))
    base = dt.datetime(2026, 1, 1, tzinfo=dt.timezone.utc)
    win, step = int(s.window_sec * SAMPLE_RATE), int(s.step_sec * SAMPLE_RATE)
    out: list = []
    for end in range(win, x.size + 1, step):
        out += det.step(x[end - win : end], end / SAMPLE_RATE, base)
    out += det.flush(base)
    t0 = base
    return [(d.track.title, (d.started_at - t0).total_seconds(), (d.ended_at - t0).total_seconds()) for d in out if isinstance(d, Detection)]


def main() -> int:
    with tempfile.TemporaryDirectory() as td:
        idx, bc, truth = build(Path(td))
        found = run_detector(idx, bc)
    ok, errors = 0, []
    remaining = list(found)
    for title, ts, te in truth:
        hit = next((f for f in remaining if f[0] == title and abs(f[1] - ts) <= TOLERANCE_SEC), None)
        if hit:
            remaining.remove(hit)
            ok += 1
            print(f"  ✓ {title:8}  start {hit[1] - ts:+5.1f}s  end {hit[2] - te:+5.1f}s")
        else:
            errors.append(f"missed {title} @ {ts:.0f}s")
    errors += [f"spurious {f[0]} @ {f[1]:.0f}s" for f in remaining]
    print(f"\n{ok}/{len(truth)} plays detected within ±{TOLERANCE_SEC:.0f}s; {len(remaining)} spurious")
    for e in errors:
        print("  ✗", e)
    return 0 if not errors else 1


if __name__ == "__main__":
    sys.exit(main())
