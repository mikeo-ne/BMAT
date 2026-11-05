"""Accuracy check on real recorded radio (not part of CI: needs recordings).

    python -m tests.real_radio_eval REC_DIR [--old OLD_PKG]

REC_DIR holds raw recordings (*.mp3) of different stations.

1. FALSE MATCHES — the catalogue is every recording cut into 3-minute pieces and
   played *backwards*: real broadcast sound (same spectrum, density, speech,
   music) that can never truly be on air. Every station is then run through the
   detector; any play reported is a false match.
2. ONE-SONG CATALOGUE — the live situation today: a single learned song.
3. REAL PLAYS — 3-minute pieces of one station are re-encoded (64 kbps, EQ,
   noise, volume change) and spliced into another station's audio with its own
   presenter talking over the start; each must be found, at the right time.
"""
from __future__ import annotations

import datetime as dt
import importlib
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np

from eastsound_ingest.audio import decode_file
from eastsound_ingest.config import Settings, Station
from eastsound_ingest.fingerprint import SAMPLE_RATE as SR, landmarks

PIECE = 180


def load(rec: Path) -> dict[str, np.ndarray]:
    out = {}
    for p in sorted(rec.glob("*.mp3")):
        try:
            x = decode_file(str(p))
        except Exception:
            continue
        if x.size > 10 * 60 * SR:
            out[p.stem] = x
    return out


def run(pkg: str, idx, x: np.ndarray, name: str) -> list:
    det_mod = importlib.import_module(f"{pkg}.detector")
    cfg = importlib.import_module(f"{pkg}.config")
    s = cfg.Settings()
    det = det_mod.Detector(cfg.Station(slug=name, name=name), idx, s)
    base = dt.datetime(2026, 1, 1, tzinfo=dt.timezone.utc)
    win, step = int(s.window_sec * SR), int(s.step_sec * SR)
    out = []
    for end in range(win, x.size + 1, step):
        out += det.step(x[end - win: end], end / SR, base)
    out += det.flush(base)
    return [(d.track.title, (d.started_at - base).total_seconds(), d.duration_sec, d.score, d.confidence)
            for d in out if type(d).__name__ == "Detection"]


def index(pkg: str, path: Path, pieces: list[tuple[str, np.ndarray]]):
    ix = importlib.import_module(f"{pkg}.index").FingerprintIndex(path)
    for title, x in pieces:
        ix.enroll(landmarks(x), title=title, artist="test", duration_sec=x.size / SR, recording_id=title)
    return ix


def degrade(x: np.ndarray, tmp: Path, seed: int) -> np.ndarray:
    from scipy.signal import butter, lfilter
    r = np.random.default_rng(seed)
    b, a = butter(2, [200 / (SR / 2), 4500 / (SR / 2)], btype="band")
    y = lfilter(b, a, x).astype(np.float32) * 0.6 + 0.01 * r.standard_normal(x.size).astype(np.float32)
    src, enc = tmp / f"d{seed}.wav", tmp / f"d{seed}.m4a"
    pcm = (np.clip(y, -1, 1) * 32767).astype("<i2").tobytes()
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-f", "s16le", "-ar", str(SR), "-ac", "1", "-i", "-", str(src)], input=pcm, check=True)
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", str(src), "-c:a", "aac", "-b:a", "64k", str(enc)], check=True)
    return decode_file(str(enc))[: x.size]


def main() -> int:
    rec = Path(sys.argv[1])
    pkgs = ["eastsound_ingest"] + ([sys.argv[sys.argv.index("--old") + 1]] if "--old" in sys.argv else [])
    audio = load(rec)
    print(f"{len(audio)} stations, {sum(x.size for x in audio.values()) / SR / 3600:.1f} h of radio\n")
    pieces = [(f"{k}@{i // SR}", x[i: i + PIECE * SR][::-1].copy()) for k, x in audio.items() for i in range(0, x.size - PIECE * SR, 2 * PIECE * SR)]
    fails = 0
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        for pkg in pkgs:
            print(f"=== {pkg}", flush=True)
            ix = index(pkg, tmp / f"{pkg}-all.db", pieces)
            fp = [(k, *d) for k, x in audio.items() for d in run(pkg, ix, x, k)]
            print(f"1. FALSE MATCHES vs {len(pieces)} backwards pieces: {len(fp)}", flush=True)
            for f in fp[:15]:
                print("     ", f)
            one = index(pkg, tmp / f"{pkg}-one.db", pieces[:1])
            fp1 = [(k, *d) for k, x in audio.items() for d in run(pkg, one, x, k)]
            print(f"2. FALSE MATCHES with a one-song catalogue: {len(fp1)}", flush=True)
            for f in fp1[:15]:
                print("     ", f)
            if pkg == "eastsound_ingest":
                fails += len(fp) + len(fp1)
            # 3. real plays
            names = list(audio)
            songs = [(f"{names[i]}-song", audio[names[i]][60 * SR: (60 + PIECE) * SR]) for i in range(len(names))]
            cat = index(pkg, tmp / f"{pkg}-real.db", songs)
            found = missed = spurious = 0
            for i, (title, x) in enumerate(songs):
                host = audio[names[(i + 1) % len(names)]]
                at = 8 * 60
                y = degrade(x, tmp, i)
                talk = host[at * SR: (at + 8) * SR] * 0.9  # host's presenter/jingle over the intro
                y[: talk.size] = 0.6 * y[: talk.size] + talk
                mix = np.concatenate([host[: at * SR], y, host[at * SR + y.size: at * SR + y.size + 120 * SR]])
                ds = run(pkg, cat, mix, f"mix{i}")
                hit = [d for d in ds if d[0] == title and abs(d[1] - at) <= 10]
                found += bool(hit)
                missed += not hit
                spurious += len([d for d in ds if d not in hit])
                print(f"     {title:18} {'found' if hit else 'MISSED'} {hit[0][1:] if hit else ''}  others: {[d for d in ds if d not in hit]}")
            print(f"3. REAL PLAYS: {found}/{len(songs)} found, {spurious} other reports\n")
            if pkg == "eastsound_ingest":
                fails += missed
    print("PASS" if not fails else f"FAIL ({fails})")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
