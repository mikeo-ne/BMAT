"""Brand-mention scanning: matcher rules + live-scanner behaviour.

  python -m tests.test_mentions          (from workers/ingest; no model download)
  EST_ASR_TEST=1 EST_PIPER_VOICES=a.onnx,b.onnx python -m tests.test_mentions
      (also runs real speech recognition with Piper voices)

The real-speech part downloads the Whisper model (base.en ≈ 210 MB, once) and needs
Piper voice files; it is not run in CI.
"""
from __future__ import annotations

import datetime as dt
import os
import sys
import threading
import time

import numpy as np

from eastsound_ingest.config import Station
from eastsound_ingest.fingerprint import SAMPLE_RATE
from eastsound_ingest.mentions import Keyword, KeywordSet, find_mentions, load_keywords_file, normalize
from eastsound_ingest.scanner import KeywordSource, MentionScanner, SpeechPool

FAILS: list[str] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    print(f"  {'✓' if ok else '✗'} {name}{('  — ' + detail) if detail else ''}")
    if not ok:
        FAILS.append(name)


KW = KeywordSet([
    Keyword("MTN", ("mtn", "m t n", "em tee en")),
    Keyword("Airtel", ("airtel", "air tel")),
    Keyword("Nile Special", ("nile special",)),
    Keyword("Stanbic Bank", ("stanbic", "stanbic bank"), aliases=("sammick bank",)),
    Keyword("Mukwano", ("mukwano",)),
    Keyword("Rwenzori Water", ("rwenzori",)),
    Keyword("Coca-Cola", ("coca cola", "coke")),
])


def brands(text: str) -> set[str]:
    return {h.brand for h in find_mentions(text, KW)}


def matcher() -> None:
    print("Matcher")
    check("normalises dotted and hyphenated names", normalize("M.T.N. and Coca-Cola!") == ["m", "t", "n", "and", "coca", "cola"])
    check("exact brand", brands("brought to you by MTN Uganda") == {"MTN"})
    check("spelled-out letters", brands("brought to you by M.T.N.") == {"MTN"})
    check("two brands in one line", brands("Airtel and MTN sponsor the concert") == {"Airtel", "MTN"})
    check("recogniser misspelling (spelling match)", brands("drink nile spatial tonight") == {"Nile Special"})
    check("recogniser misspelling (sound match)", brands("Stay hydrated with our wensory water") == {"Rwenzori Water"},
          str(brands("Stay hydrated with our wensory water")))
    check("learned 'heard as' alias", brands("Sammick Bank, Uganda, it can be") == {"Stanbic Bank"})
    check("short names never fuzzy-match", brands("I sent an empty note") == set() and brands("cake and cookies") == set())
    negatives = [
        "Please stand by, we are having some technical issues with the line.",
        "Stand back and let the boda boda pass on the left side.",
        "Buy some airtime and call your mother this weekend.",
        "The river Nile is the longest river in Africa.",
        "We have a very special guest in the studio this morning.",
        "I had hot chocolate and a cola at the market yesterday.",
        "It was a long day, I will tell you more about it later.",
        "The mountains in western Uganda are covered in mist.",
        "Air travel prices have gone up again this month.",
        "Bank holidays are coming up, so plan your trips early.",
    ]
    fp = [(t, brands(t)) for t in negatives if brands(t)]
    check(f"no false alarms on {len(negatives)} confusable everyday lines", not fp, str(fp))
    path = os.path.join(os.path.dirname(__file__), "..", "keywords.csv")
    kws = load_keywords_file(path)
    check("bundled keywords.csv loads", len(kws) >= 10 and any(k.brand == "MTN" for k in kws.keywords), f"{len(kws)} brands")


class FakeASR:
    """Returns a scripted transcript for each chunk, by its loudness tag."""

    name = "fake"

    def __init__(self, script: dict[int, str], delay: float = 0.0):
        self.script, self.delay, self.calls = script, delay, 0

    def transcribe(self, audio: np.ndarray) -> str:
        self.calls += 1
        time.sleep(self.delay)
        tag = int(round(float(np.max(np.abs(audio))) * 100))  # chunk "id" encoded as peak level
        return self.script.get(tag, "")


def tone(sec: float, level: float) -> np.ndarray:
    t = np.arange(int(sec * SAMPLE_RATE)) / SAMPLE_RATE
    return (level * np.sin(2 * np.pi * 300 * t)).astype(np.float32)


def scanner() -> None:
    print("Live scanner")
    st = Station(slug="test-fm", name="Test FM")
    base = dt.datetime(2026, 11, 5, 9, 0, tzinfo=dt.timezone.utc)
    got: list = []
    lock = threading.Lock()

    def emit(m):
        with lock:
            got.append(m)

    asr = FakeASR({20: "this hour is brought to you by MTN Uganda", 30: "MTN again, everywhere you go",
                   40: "great music on Test FM", 50: "Stanbic Bank, it can be"})
    pool = SpeechPool(asr, workers=1, max_pending=8)
    sc = MentionScanner(st, pool, KeywordSource(lambda: KW), emit, chunk_sec=15, overlap_sec=2, cooldown_sec=45)

    def run(blocks):  # list of (seconds, level, in_music)
        t = 0.0
        for sec, level, music in blocks:
            audio = tone(sec, level)
            for i in range(0, audio.size, 4 * SAMPLE_RATE):
                c = audio[i : i + 4 * SAMPLE_RATE]
                t += c.size / SAMPLE_RATE
                sc.feed(c, t, base, in_music=music)
        sc.flush(base, t)
        pool.wait_idle(30)

    # 16 s talk (MTN read) → 60 s matched song → 16 s talk (MTN again, within cooldown? no: 76 s later) → 16 s talk (Stanbic)
    run([(16, 0.20, False), (60, 0.0, True), (16, 0.30, False), (16, 0.50, False)])
    names = [(m.brand, int((m.heard_at - base).total_seconds())) for m in got]
    check("speech during a matched song is never transcribed", asr.calls <= 4, f"{asr.calls} chunks transcribed")
    check("brand found in talk with its on-air time", ("MTN", 0) in names, str(names))
    check("same brand re-reported only after the cool-down", sum(1 for b, _ in names if b == "MTN") == 2, str(names))
    check("second brand found", any(b == "Stanbic Bank" for b, _ in names), str(names))
    m = next(m for m in got if m.brand == "MTN")
    check("mention carries transcript, matched words and audio", "MTN" in m.transcript and m.heard and m.audio.size >= 3 * SAMPLE_RATE)

    got.clear()
    before = asr.calls
    run([(20, 0.001, False)])  # dead air
    check("silence is skipped without transcribing", asr.calls == before and not got)

    slow = FakeASR({20: "MTN"}, delay=0.3)
    busy = SpeechPool(slow, workers=1, max_pending=1)
    sc2 = MentionScanner(st, busy, KeywordSource(lambda: KW), lambda m: None, chunk_sec=4, overlap_sec=0)
    for i in range(12):
        sc2.feed(tone(4, 0.2), (i + 1) * 4.0, base, in_music=False)
    check("when the CPU falls behind, old chunks are skipped and counted", busy.skipped > 0, busy.summary())
    busy.close()
    pool.close()


def real_speech() -> None:
    """End to end with real recognition: a fingerprinted song between spoken ad reads and talk,
    degraded like a 64 kbps stream, read by several voices. Speech recognition is imperfect,
    so this checks a detection RATE and zero false alarms rather than every single read."""
    print("Real speech recognition")
    import subprocess
    import tempfile

    from scipy.signal import resample_poly

    from eastsound_ingest.audio import decode_file
    from eastsound_ingest.config import Settings
    from eastsound_ingest.detector import Detector
    from eastsound_ingest.fingerprint import landmarks
    from eastsound_ingest.index import FingerprintIndex
    from eastsound_ingest.speech import make_transcriber

    from .synth import SR, degrade, song, write_audio

    voices = [v for v in os.environ["EST_PIPER_VOICES"].split(",") if v]  # Piper .onnx voices
    tr = make_transcriber()
    kws_path = os.path.join(os.path.dirname(__file__), "..", "keywords.csv")
    expected, found, false, song_ok = 0, 0, [], 0
    with tempfile.TemporaryDirectory() as td:
        idx = FingerprintIndex(os.path.join(td, "i.db"))
        p = os.path.join(td, "m.wav")
        write_audio(song(3), p)
        x = decode_file(p)
        idx.enroll(landmarks(x), title="Song 3", artist="Test", duration_sec=x.size / SAMPLE_RATE, recording_id="rec-3")
        mus = resample_poly(song(3)[: 60 * SR], 1, 4).astype(np.float32)  # 44.1 → 11.025 kHz

        for voice in voices:
            def speak(text: str) -> np.ndarray:
                wav = os.path.join(td, "s.wav")
                subprocess.run([sys.executable, "-m", "piper", "-m", voice, "-c", voice + ".json", "-f", wav,
                                "--noise-scale", "0", "--noise-w-scale", "0"],  # deterministic voice
                               input=text.encode(), check=True, capture_output=True)
                return decode_file(wav)

            chat = speak("Thank you for listening. The traffic on Jinja road is heavy this morning.")
            ad = speak("This hour of great music is brought to you by M T N Uganda, everywhere you go.")
            read2 = speak("And remember, Stanbic Bank, Uganda, it can be. Visit any branch near you today.")
            gap = np.zeros(SAMPLE_RATE, np.float32)
            broadcast = np.concatenate([chat, gap, ad, gap, mus, gap, read2, gap, chat]).astype(np.float32)
            y = degrade(np.repeat(broadcast, 4), 5, talkover=False)  # degrade works at 44.1 kHz
            bc = os.path.join(td, "bc.mp3")
            write_audio(y, bc, ["-c:a", "libmp3lame", "-b:a", "64k"])
            audio = decode_file(bc)

            st = Station(slug="test-fm", name="Test FM")
            det = Detector(st, idx, Settings())
            got: list = []
            pool = SpeechPool(tr, workers=1, max_pending=50)
            sc = MentionScanner(st, pool, KeywordSource(lambda: load_keywords_file(kws_path)), got.append)
            base = dt.datetime(2026, 11, 5, 9, 0, tzinfo=dt.timezone.utc)
            win, step = 10 * SAMPLE_RATE, 4 * SAMPLE_RATE
            plays = []
            for end in range(step, audio.size + 1, step):
                if end >= win:
                    plays += [e for e in det.step(audio[end - win : end], end / SAMPLE_RATE, base) if hasattr(e, "track")]
                sc.feed(audio[end - step : end], end / SAMPLE_RATE, base, in_music=det.matching)
            plays += [e for e in det.flush(base) if hasattr(e, "track")]
            sc.flush(base, audio.size // step * step / SAMPLE_RATE)
            pool.wait_idle(900)
            pool.close()
            names = {m.brand for m in got}
            expected += 2
            found += len(names & {"MTN", "Stanbic Bank"})
            false += sorted(names - {"MTN", "Stanbic Bank"})
            song_ok += any(p.track.title == "Song 3" for p in plays)
            print(f"    {os.path.basename(voice)}: heard {[(m.brand, m.heard) for m in got]}")

    check("song still detected by fingerprint for every voice", song_ok == len(voices), f"{song_ok}/{len(voices)}")
    check("spoken brand reads detected (≥ 2 in 3)", found * 3 >= expected * 2, f"{found}/{expected}")
    check("no brand invented from ordinary talk", not false, str(false))


def main() -> int:
    matcher()
    scanner()
    if os.getenv("EST_ASR_TEST") == "1":
        real_speech()
    print(f"\n{'ALL MENTION CHECKS PASSED' if not FAILS else f'{len(FAILS)} FAILED: ' + '; '.join(FAILS)}")
    return 1 if FAILS else 0


if __name__ == "__main__":
    sys.exit(main())
