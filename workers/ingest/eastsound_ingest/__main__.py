"""CLI.

  python -m eastsound_ingest enroll master.wav --title "Kampala Nights" --artist "Nalu Akello" [--recording-id UUID --isrc ...]
  python -m eastsound_ingest enroll-dir masters/            # filenames "Artist - Title.ext"
  python -m eastsound_ingest enroll-list masters.txt        # manifest of URLs or paths, one per line
  python -m eastsound_ingest identify clip.mp3              # one-off lookup
  python -m eastsound_ingest scan recording.mp3 --station capital-fm-91-3   # whole file, faster than real time
  python -m eastsound_ingest run --stations stations.csv    # monitor live streams 24/7
  python -m eastsound_ingest resolve "Capital FM"           # look up a current stream URL
  python -m eastsound_ingest --stations stations.csv doctor # is this worker wired correctly?
"""
from __future__ import annotations

import argparse
import logging
import signal
import sys
import threading
import time
from pathlib import Path
from urllib.parse import unquote

from . import doctor, radiobrowser
from .audio import decode_file
from .config import Station, load_settings, slugify
from .fingerprint import SAMPLE_RATE, landmarks
from .index import FingerprintIndex
from .monitor import StationMonitor
from .sinks import AsyncSink, EastSoundPlayoutSink, JsonlSink, Sink, SupabaseSink

AUDIO_EXT = {".wav", ".mp3", ".flac", ".aac", ".m4a", ".ogg", ".opus", ".aiff"}


def _sink(settings) -> Sink:
    mode = settings.sink_mode
    inner: Sink = (EastSoundPlayoutSink(settings) if mode == "east-sound"
                   else SupabaseSink(settings) if mode == "supabase" else JsonlSink(settings.out_dir))
    logging.info("output: %s", {"east-sound": settings.playout_url, "supabase": "Supabase", "dry-run": settings.out_dir}[mode])
    return AsyncSink(inner, settings.out_dir)


def cmd_enroll(a, s) -> None:
    idx = FingerprintIndex(s.index_path)
    x = decode_file(a.file)
    tr = idx.enroll(landmarks(x), title=a.title, artist=a.artist, duration_sec=x.size / SAMPLE_RATE,
                    recording_id=a.recording_id, isrc=a.isrc)
    print(f"enrolled #{tr.id} {tr.artist} — {tr.title} ({tr.duration_sec:.0f}s)")


def _master_name(source: str) -> str:
    """`Artist - Title.mp3` from a local path or a (possibly signed) URL."""
    tail = source.split("?")[0].rstrip("/").rsplit("/", 1)[-1]
    return Path(unquote(tail)).stem


def _split_master(stem: str) -> tuple[str, str]:
    artist, _, title = stem.partition(" - ")
    if not title:
        return "Unknown", stem
    return artist.strip(), title.strip()


def cmd_enroll_dir(a, s) -> None:
    idx = FingerprintIndex(s.index_path)
    files = sorted(p for p in Path(a.dir).rglob("*") if p.suffix.lower() in AUDIO_EXT)
    for p in files:
        artist, title = _split_master(p.stem)
        try:
            x = decode_file(str(p))
            idx.enroll(landmarks(x), title=title.strip(), artist=artist.strip(), duration_sec=x.size / SAMPLE_RATE,
                       recording_id=f"file:{p.name}")
            print(f"  ✓ {artist} — {title}")
        except Exception as e:  # keep going on bad files
            print(f"  ✗ {p.name}: {e}", file=sys.stderr)
    print(f"{len(idx.tracks)} recordings in index")


def cmd_enroll_list(a, s) -> None:
    """Enroll every master named in a manifest: one URL or path per line.

    Used when the audio does not sit next to the worker — e.g. a label drops
    masters in a bucket and the worker folds them in without any file transfer:

        https://<bucket>/Jovan%20-%20Kampala%20Nights.mp3
        https://<bucket>/Ama%20-%20Nile%20Breeze.mp3<TAB>Ama - Nile Breeze

    A tab-separated `Artist - Title` overrides the file name. Blank lines and
    lines starting with `#` are ignored; a bad entry never stops the rest.
    """
    idx = FingerprintIndex(s.index_path)
    manifest = Path(a.manifest)
    if not manifest.exists():
        print(f"manifest not found: {manifest}", file=sys.stderr)
        sys.exit(2)
    entries = [
        line.strip() for line in manifest.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.strip().startswith("#")
    ]
    if not entries:
        print("manifest has no entries", file=sys.stderr)
        sys.exit(2)

    ok = failed = 0
    for entry in entries:
        source, _, meta = entry.partition("\t")
        artist, title = _split_master(meta.strip() or _master_name(source))
        try:
            x = decode_file(source.strip())
            idx.enroll(landmarks(x), title=title, artist=artist, duration_sec=x.size / SAMPLE_RATE,
                       recording_id=source.strip())
            ok += 1
            print(f"  ✓ {artist} — {title}")
        except Exception as e:  # one dead link must not abandon the batch
            failed += 1
            print(f"  ✗ {source.strip()}: {e}", file=sys.stderr)
    summary = f"{ok} enrolled"
    if failed:
        summary += f", {failed} failed"
    print(f"{summary} · {len(idx.tracks)} recordings in index")
    if ok == 0:
        sys.exit(1)


def cmd_identify(a, s) -> None:
    idx = FingerprintIndex(s.index_path)
    m = idx.match(landmarks(decode_file(a.file, max_seconds=30)))
    if not m:
        print("no match")
        sys.exit(1)
    print(f"{m.track.artist} — {m.track.title} | score {m.score} | confidence {m.confidence}% | at {m.track_offset_sec:.1f}s")


def mentions_enabled(a=None) -> bool:
    import os

    return bool(getattr(a, "mentions", False)) or os.getenv("EST_MENTIONS", "").lower() in ("1", "true", "yes")


def _keyword_loader(sink: Sink):
    """Brands to listen for: the database list when on Supabase, else keywords.csv."""
    import os

    from .mentions import load_keywords_file

    inner = getattr(sink, "inner", sink)
    if isinstance(inner, SupabaseSink):
        return inner.load_keywords
    path = os.getenv("EST_KEYWORDS_FILE", str(Path(__file__).resolve().parent.parent / "keywords.csv"))
    return lambda: load_keywords_file(path)


def _mention_setup(sink: Sink):
    """Shared speech pool + keyword source, or (None, None) when scanning is off."""
    import os

    from .scanner import KeywordSource, SpeechPool
    from .speech import make_transcriber

    tr = make_transcriber()
    logging.info("brand-mention scanning on (%s)", tr.name)
    pool = SpeechPool(tr, workers=int(os.getenv("EST_ASR_WORKERS", "1")), max_pending=int(os.getenv("EST_ASR_BACKLOG", "6")))
    return pool, KeywordSource(_keyword_loader(sink))


def _scanner(st: Station, pool, keywords, sink: Sink):
    from .scanner import MentionScanner

    return MentionScanner(st, pool, keywords, sink.mention) if pool else None


def cmd_transcribe(a, s) -> None:
    """Calibrate on a real recording: print what the recogniser hears and which brands match."""
    from .mentions import find_mentions, load_keywords_file
    from .speech import make_transcriber

    tr = make_transcriber()
    kws = load_keywords_file(a.keywords) if a.keywords else _keyword_loader(JsonlSink(s.out_dir))()
    x = decode_file(a.file)
    step = int(15 * SAMPLE_RATE)
    for i in range(0, x.size, step):
        text = tr.transcribe(x[i : i + step])
        hits = find_mentions(text, kws)
        mark = "  → " + ", ".join(f"{h.brand} ({h.heard!r}, {h.score})" for h in hits) if hits else ""
        print(f"[{i // SAMPLE_RATE // 60:02d}:{i // SAMPLE_RATE % 60:02d}] {text}{mark}")


def cmd_scan(a, s) -> None:
    """Run the full detector over a recorded file as if it were a live stream."""
    idx = FingerprintIndex(s.index_path)
    sink = _sink(s)
    st = Station(slug=a.station, name=a.station)
    st.stream_url = a.file
    pool, keywords = _mention_setup(sink) if mentions_enabled(a) else (None, None)
    mon = StationMonitor(st, idx, sink, s, threading.Event(), realtime=False, scanner=_scanner(st, pool, keywords, sink))
    if a.started_at:  # real wall-clock time the recording began (East Sound rejects future timestamps)
        import datetime as dt

        mon.base_override = dt.datetime.fromisoformat(a.started_at.replace("Z", "+00:00"))
    mon.run()
    if pool:
        _drain(pool)
        logging.info(pool.summary())
    sink.close()
    print(f"{mon.detections} detections" + (f", {mon.scanner.mentions} brand mentions" if mon.scanner else ""))


def _drain(pool, timeout: float = 600) -> None:
    """Wait for queued speech chunks to finish (file scans only)."""
    if not pool.wait_idle(timeout):
        logging.warning("speech queue still busy after %ss; stopping", timeout)
    pool.close()


def cmd_run(a, s) -> None:
    if not s.stations:
        sys.exit("no enabled stations in the stations file")
    idx = FingerprintIndex(s.index_path)
    if not idx.tracks:
        logging.warning("fingerprint index is empty — enroll masters first or nothing will match")
    sink = _sink(s)
    stop = threading.Event()
    signal.signal(signal.SIGTERM, lambda *_: stop.set())
    signal.signal(signal.SIGINT, lambda *_: stop.set())
    pool, keywords = _mention_setup(sink) if mentions_enabled() else (None, None)
    mons = [StationMonitor(st, idx, sink, s, stop, scanner=_scanner(st, pool, keywords, sink)) for st in s.stations]
    for m in mons:
        m.start()
        time.sleep(0.5)  # stagger connections
    logging.info("monitoring %d stations", len(mons))
    while not stop.is_set():
        stop.wait(300)
        logging.info("status: " + ", ".join(f"{m.st.slug}={m.status}/{m.detections}" for m in mons))
        if pool:
            logging.info(pool.summary())
    for m in mons:
        m.join(timeout=10)
    sink.close()


def cmd_resolve(a, s) -> None:
    print(radiobrowser.resolve(a.name) or "not found")


def main() -> None:
    p = argparse.ArgumentParser(prog="eastsound_ingest")
    p.add_argument("--stations", help="stations.csv or .json (for `run`)")
    p.add_argument("-v", "--verbose", action="store_true")
    sub = p.add_subparsers(dest="cmd", required=True)
    e = sub.add_parser("enroll"); e.add_argument("file"); e.add_argument("--title", required=True)
    e.add_argument("--artist", required=True); e.add_argument("--recording-id"); e.add_argument("--isrc")
    d = sub.add_parser("enroll-dir"); d.add_argument("dir")
    el = sub.add_parser("enroll-list"); el.add_argument("manifest")
    i = sub.add_parser("identify"); i.add_argument("file")
    sc = sub.add_parser("scan"); sc.add_argument("file"); sc.add_argument("--station", default="file")
    sc.add_argument("--mentions", action="store_true", help="also scan speech for tracked brands")
    tc = sub.add_parser("transcribe", help="print transcript + brand hits for a recording (calibration)")
    tc.add_argument("file"); tc.add_argument("--keywords", help="keywords.csv (default: database or bundled list)")
    sc.add_argument("--started-at", help="ISO time the recording began, e.g. 2026-11-04T08:00:00+03:00")
    sub.add_parser("run")
    sub.add_parser("doctor")
    r = sub.add_parser("resolve"); r.add_argument("name")
    a = p.parse_args()
    logging.basicConfig(level=logging.DEBUG if a.verbose else logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    s = load_settings(a.stations)
    Path(s.index_path).parent.mkdir(parents=True, exist_ok=True)
    if a.cmd == "doctor":
        sys.exit(doctor.main(s))
    {"enroll": cmd_enroll, "enroll-dir": cmd_enroll_dir, "enroll-list": cmd_enroll_list,
     "identify": cmd_identify, "scan": cmd_scan,
     "run": cmd_run, "resolve": cmd_resolve, "transcribe": cmd_transcribe}[a.cmd](a, s)


if __name__ == "__main__":
    main()
