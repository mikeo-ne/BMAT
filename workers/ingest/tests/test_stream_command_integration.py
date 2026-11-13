"""Exercise the real ffmpeg stream command against local MP3 and HLS fixtures.

Run from workers/ingest: python -m tests.test_stream_command_integration
No external station or network access is required. CI installs ffmpeg.
"""
from __future__ import annotations

import functools
import http.server
import subprocess
import tempfile
import threading
from pathlib import Path

from eastsound_ingest.audio import stream_command
from eastsound_ingest.fingerprint import SAMPLE_RATE


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        pass


def main() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        # Generated locally: no copyrighted fixture or external streams.
        def create(*args: str) -> None:
            subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i",
                            "sine=frequency=440:sample_rate=44100:duration=3", *args],
                           check=True, capture_output=True, timeout=30)

        create("-c:a", "libmp3lame", "-f", "mp3", str(root / "radio.mp3"))
        create("-c:a", "aac", "-f", "hls", "-hls_time", "1", "-hls_list_size", "0",
               "-hls_playlist_type", "vod", str(root / "tv.m3u8"))
        handler = functools.partial(QuietHandler, directory=tmp)
        server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            for path, kind in (("radio.mp3", "radio"), ("tv.m3u8", "tv")):
                url = f"http://127.0.0.1:{server.server_port}/{path}"
                result = subprocess.run(stream_command(url, kind), capture_output=True, timeout=30)
                assert result.returncode == 0, f"{kind} ffmpeg failed: {result.stderr.decode(errors='replace')}"
                # 16-bit mono at SAMPLE_RATE: require at least half a second.
                assert len(result.stdout) >= SAMPLE_RATE, f"{kind} returned too little PCM: {len(result.stdout)} bytes"
                print(f"{kind}: decoded {len(result.stdout)} bytes of PCM over HTTP")
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=5)


if __name__ == "__main__":
    main()
