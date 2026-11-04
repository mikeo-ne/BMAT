"""Landmark ("constellation") audio fingerprinting.

1. Short-time Fourier transform of 11.025 kHz mono audio.
2. Keep spectral peaks that are the loudest in their neighbourhood.
3. Pair each peak (anchor) with a few later peaks in a target zone and hash
   (anchor_freq, target_freq, time_gap) into one integer.

Hashes depend only on peak *positions*, not loudness, so they survive volume
changes, EQ, MP3/AAC compression, background noise and a presenter talking
over the song. Two clips match when many hashes agree on the same time offset.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from scipy.ndimage import maximum_filter

SAMPLE_RATE = 11025
N_FFT = 1024
HOP = 256  # ~23 ms per frame → ~43 frames / second
FRAMES_PER_SEC = SAMPLE_RATE / HOP

F_MIN_BIN = int(250 / (SAMPLE_RATE / N_FFT))  # ignore rumble below 250 Hz
F_MAX_BIN = int(5000 / (SAMPLE_RATE / N_FFT))  # ignore hiss above 5 kHz

PEAK_NEIGHBOURHOOD = (15, 11)  # (freq bins, frames)
PEAKS_PER_SEC = 32
FAN_OUT = 8
DT_MIN, DT_MAX = 1, 63  # frames (fits in 6 bits)
DF_MAX = 120  # freq bins


@dataclass(frozen=True)
class Landmarks:
    hashes: np.ndarray  # uint32
    offsets: np.ndarray  # int32 frame index of the anchor peak


def pcm16_to_float(raw: bytes) -> np.ndarray:
    return np.frombuffer(raw, dtype="<i2").astype(np.float32) / 32768.0


def spectrogram(x: np.ndarray) -> np.ndarray:
    """Log-magnitude spectrogram, shape (freq_bins, frames)."""
    if x.size < N_FFT:
        return np.zeros((N_FFT // 2 + 1, 0), dtype=np.float32)
    frames = 1 + (x.size - N_FFT) // HOP
    idx = np.arange(N_FFT)[None, :] + HOP * np.arange(frames)[:, None]
    win = np.hanning(N_FFT).astype(np.float32)
    spec = np.abs(np.fft.rfft(x[idx] * win, axis=1)).T
    return np.log1p(spec * 100.0).astype(np.float32)


def find_peaks(spec: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Return (freq_bins, frames) of salient local maxima, sorted by time."""
    if spec.shape[1] == 0:
        return np.empty(0, np.int32), np.empty(0, np.int32)
    band = spec[F_MIN_BIN:F_MAX_BIN]
    # Remove each frame's broadband level so peaks are relative (EQ-robust).
    band = band - np.median(band, axis=0, keepdims=True)
    local_max = maximum_filter(band, size=PEAK_NEIGHBOURHOOD, mode="constant") == band
    mask = local_max & (band > 0.6)
    f, t = np.nonzero(mask)
    if f.size == 0:
        return f.astype(np.int32), t.astype(np.int32)
    # Keep the strongest peaks per second so density is uniform.
    strength = band[f, t]
    budget = max(1, int(PEAKS_PER_SEC * spec.shape[1] / FRAMES_PER_SEC))
    if f.size > budget:
        sec = (t / FRAMES_PER_SEC).astype(np.int32)
        keep = np.zeros(f.size, bool)
        for s in np.unique(sec):
            sel = np.nonzero(sec == s)[0]
            top = sel[np.argsort(strength[sel])[::-1][:PEAKS_PER_SEC]]
            keep[top] = True
        f, t = f[keep], t[keep]
    order = np.argsort(t, kind="stable")
    return (f[order] + F_MIN_BIN).astype(np.int32), t[order].astype(np.int32)


def landmarks(x: np.ndarray) -> Landmarks:
    f, t = find_peaks(spectrogram(x))
    hashes: list[np.ndarray] = []
    offsets: list[np.ndarray] = []
    n = f.size
    for i in range(n):
        j = i + 1
        cand_f: list[int] = []
        cand_dt: list[int] = []
        while j < n and len(cand_f) < FAN_OUT:
            dt = t[j] - t[i]
            if dt > DT_MAX:
                break
            if dt >= DT_MIN and abs(int(f[j]) - int(f[i])) <= DF_MAX:
                cand_f.append(int(f[j]))
                cand_dt.append(int(dt))
            j += 1
        if cand_f:
            cf = np.asarray(cand_f, np.uint32)
            cdt = np.asarray(cand_dt, np.uint32)
            h = (np.uint32(f[i]) << np.uint32(16)) | (cf << np.uint32(6)) | cdt
            hashes.append(h)
            offsets.append(np.full(cf.size, t[i], np.int32))
    if not hashes:
        return Landmarks(np.empty(0, np.uint32), np.empty(0, np.int32))
    return Landmarks(np.concatenate(hashes), np.concatenate(offsets))


def frames_to_seconds(frames: int | float) -> float:
    return float(frames) / FRAMES_PER_SEC
