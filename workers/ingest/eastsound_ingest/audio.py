"""ffmpeg helpers: decode any file or URL to 11.025 kHz mono PCM, encode clips."""
from __future__ import annotations

import subprocess

import numpy as np

from .fingerprint import SAMPLE_RATE, pcm16_to_float


def decode_file(path: str, max_seconds: float | None = None) -> np.ndarray:
    cmd = ["ffmpeg", "-loglevel", "error", "-nostdin", "-i", path, "-vn", "-ac", "1", "-ar", str(SAMPLE_RATE)]
    if max_seconds:
        cmd += ["-t", str(max_seconds)]
    cmd += ["-f", "s16le", "-"]
    res = subprocess.run(cmd, capture_output=True, check=True)
    return pcm16_to_float(res.stdout)


def encode_mp3(x: np.ndarray, bitrate: str = "64k") -> bytes:
    """Encode an evidence clip (float mono @ SAMPLE_RATE) to MP3 bytes."""
    pcm = (np.clip(x, -1, 1) * 32767).astype("<i2").tobytes()
    res = subprocess.run(
        ["ffmpeg", "-loglevel", "error", "-nostdin", "-f", "s16le", "-ar", str(SAMPLE_RATE), "-ac", "1", "-i", "-",
         "-c:a", "libmp3lame", "-b:a", bitrate, "-f", "mp3", "-"],
        input=pcm, capture_output=True, check=True,
    )
    return res.stdout


def stream_command(url: str, kind: str = "radio") -> list[str]:
    """ffmpeg command that pulls a live stream forever, reconnecting on drops.

    TV channels are usually HLS playlists rather than an Icecast MP3 stream. The
    http reconnect flags apply to the playlist fetches too, but HLS needs a
    longer probe and a window that follows the live edge instead of starting at
    segment zero (which would replay the last hour of television).
    """
    cmd = ["ffmpeg", "-loglevel", "error", "-nostdin"]
    if url.startswith(("http://", "https://")):
        cmd += [
            "-reconnect", "1", "-reconnect_streamed", "1", "-reconnect_on_network_error", "1",
            "-reconnect_delay_max", "30", "-rw_timeout", "15000000",
            "-user_agent", "EastSoundMonitor/0.1 (+https://eastsound.ug)",
        ]
    if kind == "tv" or ".m3u8" in url:
        cmd += ["-fflags", "+genpts", "-live_start_index", "-1", "-analyzeduration", "10000000"]
    cmd += ["-vn", "-ac", "1", "-ar", str(SAMPLE_RATE), "-i", url, "-f", "s16le", "-"]
    return cmd
