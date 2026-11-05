"""Speech-to-text engines for brand-mention scanning.

Two engines, chosen with EST_ASR_ENGINE:

* ``sherpa`` (default) — OpenAI Whisper English models run through sherpa-onnx
  on the CPU. Models download once from the sherpa-onnx GitHub releases and are
  checked against pinned SHA-256 hashes. Measured on 2 CPU cores:
  base.en (default) ≈ 9× real time; small.en ≈ 2.5× real time and more accurate —
  use it when the worker has ~4 cores for 7 stations.
* ``faster-whisper`` — any CTranslate2 Whisper model, e.g.
  ``Sunbird/faster-whisper-51-african-languages`` (Whisper large-v3 fine-tuned
  by Sunbird AI for 51 African languages including Luganda; use
  EST_ASR_LANGUAGE=sd per its model card). Large models need a GPU to keep up
  with live radio. Supports EST_ASR_PROMPT to bias spelling toward your brands.
  Install with: pip install faster-whisper

Standard Whisper has no Luganda; brand names are usually still recognised in
English mode because presenters pronounce them the same way in either language.
"""
from __future__ import annotations

import hashlib
import logging
import os
import tarfile
import tempfile
import urllib.request
from pathlib import Path
from typing import Protocol

import numpy as np
from scipy.signal import resample_poly

from .fingerprint import SAMPLE_RATE

log = logging.getLogger(__name__)

RELEASE = "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models"
# sha256 of each release archive, pinned so a swapped download is refused.
SHERPA_MODELS = {
    "tiny.en": "2bd6cf965c8bb3e068ef9fa2191387ee63a9dfa2a4e37582a8109641c20005dd",
    "base.en": "475bc7052ce299c007f6d5d5407ba8601f819a2867f6eecee510ed17df581542",
    "small.en": "0cdba2b8aaab69e04847f3427cc9709574112e67913a1a84b7fec3a8729faa9a",
}


class Transcriber(Protocol):
    name: str

    def transcribe(self, audio: np.ndarray) -> str:
        """`audio`: float32 mono at the worker's SAMPLE_RATE (11.025 kHz)."""


def to_16k(audio: np.ndarray) -> np.ndarray:
    return resample_poly(audio, 640, 441).astype(np.float32)  # 11025 → 16000


def ensure_sherpa_model(model: str, model_dir: str | Path) -> Path:
    """Download + verify + unpack a sherpa-onnx Whisper model once; return its folder."""
    if model not in SHERPA_MODELS:
        raise ValueError(f"unknown model {model!r}; choose one of {', '.join(SHERPA_MODELS)}")
    root = Path(model_dir)
    folder = root / f"sherpa-onnx-whisper-{model}"
    if (folder / f"{model}-tokens.txt").exists():
        return folder
    root.mkdir(parents=True, exist_ok=True)
    url = f"{RELEASE}/sherpa-onnx-whisper-{model}.tar.bz2"
    log.info("downloading speech model %s (one-time)…", model)
    with tempfile.NamedTemporaryFile(dir=root, suffix=".tar.bz2", delete=False) as tmp:
        h = hashlib.sha256()
        with urllib.request.urlopen(url, timeout=60) as r:
            while chunk := r.read(1 << 20):
                h.update(chunk)
                tmp.write(chunk)
        archive = Path(tmp.name)
    try:
        if h.hexdigest() != SHERPA_MODELS[model]:
            raise RuntimeError(f"checksum mismatch for {model}: refusing to use the download")
        with tarfile.open(archive, "r:bz2") as tar:
            def keep(m: tarfile.TarInfo) -> bool:
                base = m.name.rsplit("/", 1)[-1]
                needed = base == f"{model}-tokens.txt" or (base.startswith(f"{model}-") and base.endswith(".int8.onnx"))
                return m.isfile() and m.name.startswith(f"sherpa-onnx-whisper-{model}/") and needed

            # "data" filter also blocks absolute paths, ".." and links (Python ≥ 3.12)
            tar.extractall(root, members=[m for m in tar.getmembers() if keep(m)], filter="data")
    finally:
        archive.unlink(missing_ok=True)
    return folder


class SherpaWhisper:
    def __init__(self, model: str = "base.en", model_dir: str = "data/models", threads: int = 2):
        import sherpa_onnx  # imported lazily: only needed when scanning is on

        d = ensure_sherpa_model(model, model_dir)
        self.name = f"whisper-{model}"
        self._rec = sherpa_onnx.OfflineRecognizer.from_whisper(
            encoder=str(d / f"{model}-encoder.int8.onnx"),
            decoder=str(d / f"{model}-decoder.int8.onnx"),
            tokens=str(d / f"{model}-tokens.txt"),
            language="en", task="transcribe", num_threads=threads,
        )

    def transcribe(self, audio: np.ndarray) -> str:
        s = self._rec.create_stream()
        s.accept_waveform(16000, to_16k(audio))
        self._rec.decode_stream(s)
        return s.result.text.strip()


class FasterWhisper:
    def __init__(self, model: str, language: str | None = None, prompt: str | None = None, threads: int = 2):
        from faster_whisper import WhisperModel  # optional dependency

        self.name = f"faster-whisper:{model}"
        self._language = language or None
        self._prompt = prompt or None
        self._model = WhisperModel(model, device="auto", compute_type="default", cpu_threads=threads)

    def transcribe(self, audio: np.ndarray) -> str:
        segments, _info = self._model.transcribe(
            to_16k(audio), language=self._language, initial_prompt=self._prompt,
            vad_filter=True, beam_size=1, condition_on_previous_text=False,
        )
        return " ".join(seg.text.strip() for seg in segments).strip()


def make_transcriber() -> Transcriber:
    engine = os.getenv("EST_ASR_ENGINE", "sherpa").strip().lower()
    threads = int(os.getenv("EST_ASR_THREADS", "2"))
    model_dir = os.getenv("EST_MODEL_DIR", str(Path(os.getenv("EST_INDEX_PATH", "data/x")).parent / "models"))
    if engine == "faster-whisper":
        model = os.getenv("EST_ASR_MODEL", "small.en")
        return FasterWhisper(model, os.getenv("EST_ASR_LANGUAGE"), os.getenv("EST_ASR_PROMPT"), threads)
    if engine == "sherpa":
        return SherpaWhisper(os.getenv("EST_ASR_MODEL", "base.en"), model_dir, threads)
    raise ValueError(f"EST_ASR_ENGINE must be 'sherpa' or 'faster-whisper', not {engine!r}")


__all__ = ["Transcriber", "SherpaWhisper", "FasterWhisper", "make_transcriber", "ensure_sherpa_model", "SAMPLE_RATE"]
