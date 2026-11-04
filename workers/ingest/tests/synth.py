"""Synthetic test catalogue + degraded 'broadcast' generator (test-only)."""
from __future__ import annotations

import subprocess
from pathlib import Path

import numpy as np

SR = 44100


def song(seed: int, seconds: float = 90.0) -> np.ndarray:
    """A deterministic, musically distinct track: drums, bass, chords, melody."""
    r = np.random.default_rng(seed)
    n = int(SR * seconds)
    t = np.arange(n) / SR
    out = np.zeros(n, np.float32)
    bpm = r.integers(84, 132)
    beat = 60.0 / bpm
    root = 110.0 * 2 ** (r.integers(0, 12) / 12)
    scale = np.array([0, 2, 3, 5, 7, 8, 10, 12]) if r.random() < 0.5 else np.array([0, 2, 4, 5, 7, 9, 11, 12])
    prog = r.choice(8, size=4)

    def env(start: float, dur: float, decay: float) -> tuple[slice, np.ndarray]:
        a = int(start * SR)
        b = min(n, a + int(dur * SR))
        e = np.exp(-np.arange(b - a) / (decay * SR))
        return slice(a, b), e

    for k in range(int(seconds / beat)):
        s, e = env(k * beat, 0.25, 0.05)  # kick
        tt = np.arange(e.size) / SR
        out[s] += 0.6 * np.sin(2 * np.pi * (50 + 90 * np.exp(-tt * 30)) * tt) * e
        if k % 2:
            s, e = env(k * beat, 0.15, 0.03)  # snare / hat noise
            out[s] += 0.15 * r.standard_normal(e.size) * e
    bar = beat * 4
    for b in range(int(seconds / bar)):
        deg = scale[prog[b % 4] % len(scale)]
        f0 = root * 2 ** (deg / 12)
        s, e = env(b * bar, bar, bar)
        tt = np.arange(e.size) / SR
        for ratio in (1, 1.25 if deg % 2 else 1.2, 1.5):  # triad pad
            out[s] += 0.08 * np.sin(2 * np.pi * f0 * 2 * ratio * tt) * (0.4 + 0.6 * e)
        for q in range(8):  # bass eighths
            s2, e2 = env(b * bar + q * beat / 2, beat / 2, 0.12)
            tt2 = np.arange(e2.size) / SR
            out[s2] += 0.25 * np.sin(2 * np.pi * f0 * tt2) * e2
    for k in range(int(seconds / (beat / 2))):  # melody
        if r.random() < 0.3:
            continue
        f = root * 4 * 2 ** (scale[r.integers(0, len(scale))] / 12)
        s, e = env(k * beat / 2, beat / 2, 0.18)
        tt = np.arange(e.size) / SR
        out[s] += 0.18 * (np.sin(2 * np.pi * f * tt) + 0.3 * np.sin(4 * np.pi * f * tt)) * e
    return (out / (np.abs(out).max() + 1e-9) * 0.9).astype(np.float32)


def talk(seconds: float, seed: int = 0) -> np.ndarray:
    """Speech-like signal: formant-filtered noise bursts with syllable rhythm."""
    r = np.random.default_rng(seed)
    n = int(SR * seconds)
    x = r.standard_normal(n).astype(np.float32)
    from scipy.signal import butter, lfilter

    b, a = butter(2, [300 / (SR / 2), 3000 / (SR / 2)], btype="band")
    x = lfilter(b, a, x).astype(np.float32)
    syll = (np.sin(2 * np.pi * 4.5 * np.arange(n) / SR + r.random() * 6) > 0.2).astype(np.float32)
    pitch = np.sin(2 * np.pi * (120 + 20 * np.sin(np.arange(n) / SR)) * np.arange(n) / SR)
    return (0.4 * x * syll + 0.15 * pitch * syll).astype(np.float32)


def write_audio(x: np.ndarray, path: Path, codec_args: list[str] | None = None) -> None:
    """Write float mono via ffmpeg (wav by default, or mp3/aac via codec_args)."""
    pcm = (np.clip(x, -1, 1) * 32767).astype("<i2").tobytes()
    cmd = ["ffmpeg", "-loglevel", "error", "-y", "-f", "s16le", "-ar", str(SR), "-ac", "1", "-i", "-"]
    cmd += codec_args or []
    cmd.append(str(path))
    subprocess.run(cmd, input=pcm, check=True)


def degrade(x: np.ndarray, seed: int, talkover: bool = True) -> np.ndarray:
    """Broadcast-style damage: EQ tilt, compression, noise, optional talk-over."""
    from scipy.signal import butter, lfilter

    r = np.random.default_rng(seed)
    b, a = butter(2, [180 / (SR / 2), 6500 / (SR / 2)], btype="band")
    y = lfilter(b, a, x).astype(np.float32) * 1.6
    y = np.tanh(y * 1.8) / 1.8  # broadcast limiter
    y += 0.03 * r.standard_normal(y.size).astype(np.float32)  # hiss
    if talkover:
        voice = talk(y.size / SR, seed)
        gate = np.zeros(y.size, np.float32)
        gate[: int(8 * SR)] = 1.0  # presenter talks over the intro for 8 s
        y = y * (1 - 0.5 * gate) + voice * gate * 1.2
    return (y * 0.7).astype(np.float32)
