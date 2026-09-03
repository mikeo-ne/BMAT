"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  detectSpectralPeaks,
  frameEnergy,
  framePeakMagnitude,
} from "@/lib/audio-fingerprint";

interface AudioVisualizerProps {
  /** FFT window. Must be a power of two; the analyser yields fftSize/2 bins. */
  fftSize?: number;
  /** Minimum magnitude (0–255) for a bin to qualify as a landmark. */
  peakThreshold?: number;
}

type MonitorError = "unsupported" | "denied" | "unavailable" | "failed";

const ERROR_COPY: Record<MonitorError, string> = {
  unsupported: "This browser exposes no getUserMedia. Try Chrome, Edge, Firefox or Safari.",
  denied: "Microphone access was blocked. Allow the microphone in your site settings and retry.",
  unavailable: "No audio input device was found. Connect a microphone and retry.",
  failed: "The audio stream could not be opened. Check the device and try again.",
};

function Icon({ path, className }: { path: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      <path d={path} />
    </svg>
  );
}

// Inline rather than pulled from an icon package: the monitor deliberately
// carries no media dependencies beyond the Web Audio API itself.
const ICONS = {
  mic: "M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3ZM19 10v2a7 7 0 0 1-14 0v-2M12 19v3",
  micOff: "M2 2l20 20M9 9v3a3 3 0 0 0 5.1 2.1M15 9.3V5a3 3 0 0 0-5.9-.7M19 10v2a7 7 0 0 1-.7 3M5 10v2a7 7 0 0 0 10.7 6M12 19v3",
  activity: "M22 12h-4l-3 9L9 3l-3 9H2",
  bolt: "M13 2 3 14h7l-1 8 10-12h-7l1-8Z",
};

/**
 * Live spectral landmark detector.
 *
 * Opens the operator's microphone through `getUserMedia`, runs it through a
 * native `AnalyserNode`, and paints the magnitude spectrum with the extracted
 * landmarks overlaid. Nothing here is synthesised — the trace is the room.
 *
 * Two things it deliberately is **not**:
 * - it is not a recognition engine. There is no reference index, so the peaks
 *   are salience markers, not matched works;
 * - it does not feed the station grid. The station feeds are simulated in
 *   `lib/monitor-audio.ts` because there are no live streams to tap.
 */
export function AudioFingerprintVisualizer({
  fftSize = 256,
  peakThreshold = 140,
}: AudioVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isListening, setIsListening] = useState(false);
  const [readout, setReadout] = useState({ peaks: 0, magnitude: 0, level: 0 });
  const [error, setError] = useState<MonitorError | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Last published read-out. The draw loop runs at ~60fps, so state is only
  // written when a value actually moves — never once per frame.
  const publishedRef = useRef({ peaks: -1, magnitude: -1 });

  const stopAudioMonitoring = useCallback(() => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;

    const context = audioContextRef.current;
    if (context && context.state !== "closed") {
      // close() is async; ignoring the result is safe on teardown.
      void context.close();
    }
    audioContextRef.current = null;
    analyserRef.current = null;

    publishedRef.current = { peaks: -1, magnitude: -1 };
    setReadout({ peaks: 0, magnitude: 0, level: 0 });
    setIsListening(false);
  }, []);

  const startAudioMonitoring = useCallback(async () => {
    setError(null);

    const devices = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
    if (!devices?.getUserMedia) {
      setError("unsupported");
      return;
    }

    let stream: MediaStream;
    try {
      stream = await devices.getUserMedia({ audio: true, video: false });
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      if (name === "NotAllowedError" || name === "SecurityError") setError("denied");
      else if (name === "NotFoundError" || name === "OverconstrainedError") setError("unavailable");
      else setError("failed");
      return;
    }

    try {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

      if (!Ctor) {
        stream.getTracks().forEach((track) => track.stop());
        setError("unsupported");
        return;
      }

      const audioContext = new Ctor();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = fftSize;
      analyser.smoothingTimeConstant = 0.8;

      audioContext.createMediaStreamSource(stream).connect(analyser);

      // Safari hands back a suspended context outside a trusted gesture; without
      // this the analyser returns a flat frame and the canvas looks broken.
      if (audioContext.state === "suspended") {
        await audioContext.resume();
      }

      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      mediaStreamRef.current = stream;
      setIsListening(true);
    } catch {
      stream.getTracks().forEach((track) => track.stop());
      setError("failed");
    }
  }, [fftSize]);

  const drawLoop = useCallback(() => {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return; // headless / SSR

    const spectrum = new Uint8Array(analyser.frequencyBinCount);

    const draw = () => {
      animationFrameRef.current = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(spectrum);

      const dpr = window.devicePixelRatio || 1;
      const width = canvas.clientWidth;
      const cssHeight = canvas.clientHeight;

      if (
        canvas.width !== Math.round(width * dpr) ||
        canvas.height !== Math.round(cssHeight * dpr)
      ) {
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(cssHeight * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      ctx.fillStyle = "#0b0f17"; // --background
      ctx.fillRect(0, 0, width, cssHeight);

      const bins = spectrum.length;
      const barWidth = width / bins;
      const peaks = detectSpectralPeaks(spectrum, { threshold: peakThreshold });
      const peakSet = new Set(peaks);

      // Built once per frame, not once per bin.
      const gradient = ctx.createLinearGradient(0, cssHeight, 0, 0);
      gradient.addColorStop(0, "rgba(53,208,165,0.35)"); // --accent
      gradient.addColorStop(1, "rgba(245,165,36,0.95)"); // --brand
      ctx.fillStyle = gradient;

      for (let i = 0; i < bins; i++) {
        const barHeight = (spectrum[i] / 255) * cssHeight;
        ctx.fillRect(i * barWidth, cssHeight - barHeight, Math.max(barWidth - 1, 1), barHeight);
      }

      if (peaks.length > 0) {
        ctx.shadowColor = "rgba(245,165,36,0.85)";
        ctx.shadowBlur = 8;
        ctx.fillStyle = "#f5a524";

        for (const bin of peakSet) {
          const barHeight = (spectrum[bin] / 255) * cssHeight;
          ctx.beginPath();
          ctx.arc(bin * barWidth + barWidth / 2, Math.max(cssHeight - barHeight - 8, 6), 3.5, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.shadowBlur = 0;
      }

      const magnitude = framePeakMagnitude(spectrum);
      if (
        peaks.length !== publishedRef.current.peaks ||
        magnitude !== publishedRef.current.magnitude
      ) {
        publishedRef.current = { peaks: peaks.length, magnitude };
        setReadout({
          peaks: peaks.length,
          magnitude,
          level: Math.round((frameEnergy(spectrum) / (bins * 255)) * 100),
        });
      }
    };

    draw();
  }, [peakThreshold]);

  // Drive the loop off `isListening` alone. Depending on drawLoop as well would
  // start a second requestAnimationFrame chain whenever peakThreshold changed.
  useEffect(() => {
    if (!isListening) return;

    if (animationFrameRef.current !== null) cancelAnimationFrame(animationFrameRef.current);
    drawLoop();

    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [isListening, drawLoop]);

  // Re-apply the FFT window to a live analyser rather than ignoring the change.
  useEffect(() => {
    if (analyserRef.current) analyserRef.current.fftSize = fftSize;
  }, [fftSize]);

  useEffect(() => stopAudioMonitoring, [stopAudioMonitoring]);

  return (
    <section className="panel p-4" aria-labelledby="fingerprint-visualiser-heading">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2
            id="fingerprint-visualiser-heading"
            className="flex items-center gap-2 text-sm font-semibold tracking-tight"
          >
            <Icon path={ICONS.activity} className="h-4 w-4 text-accent" />
            Live fingerprint peak detector
          </h2>
          <p className="mt-1 max-w-prose text-xs leading-relaxed text-muted">
            Reads the local microphone through a native <code>AnalyserNode</code> and marks
            spectral landmarks. Landmarks are salience, not matched works — East Sound holds no reference
            index to match against.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <span className="chip font-mono text-brand">
            <Icon path={ICONS.bolt} className="h-3 w-3" />
            <span aria-live="polite">{readout.peaks} {readout.peaks === 1 ? "landmark" : "landmarks"}</span>
          </span>

          <button
            type="button"
            onClick={isListening ? stopAudioMonitoring : () => void startAudioMonitoring()}
            aria-pressed={isListening}
            className={isListening ? "btn" : "btn btn-primary"}
          >
            <Icon
              path={isListening ? ICONS.micOff : ICONS.mic}
              className="h-4 w-4"
            />
            {isListening ? "Stop listening" : "Start monitoring"}
          </button>
        </div>
      </div>

      {error ? (
        <p role="alert" className="mt-3 rounded border border-line bg-surface-2 px-3 py-2 text-xs text-brand">
          {ERROR_COPY[error]}
        </p>
      ) : null}

      <div className="relative mt-4 overflow-hidden rounded-lg border border-line bg-background">
        <canvas
          ref={canvasRef}
          className="block h-48 w-full"
          role="img"
          aria-label={
            isListening
              ? `Live frequency spectrum with ${readout.peaks} detected landmarks`
              : "Idle frequency spectrum"
          }
        />
        {!isListening ? (
          <div className="absolute inset-0 flex items-center justify-center bg-background/80 text-xs text-muted">
            Select “Start monitoring” to capture an audio stream
          </div>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3 text-[11px] text-muted">
        <div className="flex flex-wrap items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-accent/70" aria-hidden />
            FFT spectrum
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-brand" aria-hidden />
            Landmark peaks
          </span>
        </div>
        <span className="font-mono">
          fft {fftSize} · threshold {peakThreshold} ·{" "}
          {isListening ? `${readout.magnitude}/255 peak · ${readout.level}% level` : "idle"}
        </span>
      </div>
    </section>
  );
}

export default AudioFingerprintVisualizer;
