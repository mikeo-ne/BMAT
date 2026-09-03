"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AudioFingerprintVisualizer } from "@/components/audio-fingerprint-visualizer";
import { DetectionFeed } from "@/components/detection-feed";
import { StationCard } from "@/components/station-card";
import { formatClock, formatRatio, timeAgo } from "@/lib/format";
import { audioContextAvailable, MonitorFeed } from "@/lib/monitor-audio";
import {
  driftTelemetry,
  generateTelemetry,
  lastDetectionByStation,
  MONITORED_STATIONS,
  monitoredCount,
  simulateScan,
  summariseMonitor,
  type Detection,
  type StationTelemetry,
} from "@/lib/monitoring";
import type { Track } from "@/lib/types";

interface StationMonitorProps {
  catalogue: Track[];
}

const DRIFT_MS = 2500;
const REVEAL_MS = 200;
const DEFAULT_VOLUME = 0.12;

function seedTelemetry(): Record<string, StationTelemetry> {
  return Object.fromEntries(
    MONITORED_STATIONS.map((station) => [station.id, generateTelemetry(station.id)]),
  );
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function StationMonitor({ catalogue }: StationMonitorProps) {
  const [telemetry, setTelemetry] = useState<Record<string, StationTelemetry>>(seedTelemetry);
  const [detections, setDetections] = useState<Detection[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [volumes, setVolumes] = useState<Record<string, number>>({});
  const [scanning, setScanning] = useState(false);
  const [lastScanAt, setLastScanAt] = useState<string | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);

  const feedRef = useRef<MonitorFeed | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      feedRef.current?.stop();
      feedRef.current = null;
    };
  }, []);

  // Telemetry wanders so the grid reads as a live panel rather than a snapshot.
  useEffect(() => {
    let tick = 0;
    const timer = setInterval(() => {
      tick += 1;
      setTelemetry((prev) => {
        const next: Record<string, StationTelemetry> = {};
        for (const [id, current] of Object.entries(prev)) {
          next[id] = driftTelemetry(id, current, tick);
        }
        return next;
      });
    }, DRIFT_MS);

    return () => clearInterval(timer);
  }, []);

  const stopFeed = useCallback(() => {
    feedRef.current?.stop();
    feedRef.current = null;
    setAnalyser(null);
    setActiveId(null);
  }, []);

  const togglePlay = useCallback(
    async (stationId: string) => {
      if (activeId === stationId) {
        stopFeed();
        return;
      }

      feedRef.current?.stop();
      feedRef.current = null;
      setAnalyser(null);

      const index = MONITORED_STATIONS.findIndex((s) => s.id === stationId);
      const feed = new MonitorFeed({
        volume: volumes[stationId] ?? DEFAULT_VOLUME,
        seed: 1 + (index < 0 ? 0 : index) * 0.13,
      });

      const started = await feed.start();
      if (!started) {
        setAudioError(
          audioContextAvailable()
            ? "This browser blocked the monitor feed. Allow audio and try again."
            : "Web Audio is unavailable in this browser, so the feed cannot be previewed.",
        );
        setActiveId(null);
        return;
      }

      setAudioError(null);
      feedRef.current = feed;
      setAnalyser(feed.getAnalyser());
      setActiveId(stationId);
    },
    [activeId, stopFeed, volumes],
  );

  const changeVolume = useCallback(
    (stationId: string, volume: number) => {
      setVolumes((prev) => ({ ...prev, [stationId]: volume }));
      if (activeId === stationId) feedRef.current?.setVolume(volume);
    },
    [activeId],
  );

  const runScan = useCallback(async () => {
    if (scanning) return;

    setScanning(true);
    setAudioError(null);

    const startedAt = new Date();
    const results = simulateScan({
      stations: MONITORED_STATIONS,
      catalogue,
      telemetry,
      now: startedAt,
      seed: `${startedAt.getTime()}`,
    });

    // Walk the feed in one station at a time so matches appear as they land.
    for (const detection of results) {
      await sleep(REVEAL_MS);
      if (!mounted.current) return;
      setDetections((prev) => [detection, ...prev]);
    }

    if (!mounted.current) return;
    setLastScanAt(startedAt.toISOString());
    setScanning(false);
  }, [catalogue, scanning, telemetry]);

  const summary = useMemo(() => summariseMonitor(telemetry, detections), [telemetry, detections]);
  const lastByStation = useMemo(() => lastDetectionByStation(detections), [detections]);

  const cards = [
    { label: "Feeds monitored", value: `${summary.online}/${summary.stations}`, hint: `${monitoredCount("TV")} TV · ${monitoredCount("FM")} FM` },
    { label: "Panel health", value: formatRatio(summary.online / Math.max(1, summary.stations), 0), hint: `${summary.degraded} degraded · ${summary.offline} offline` },
    { label: "Detections", value: String(summary.detections), hint: `${summary.matched} matched · ${summary.unmatched} unmatched` },
    { label: "Match rate", value: summary.detections === 0 ? "—" : formatRatio(summary.matchRate, 0), hint: `avg confidence ${summary.detections === 0 ? "—" : formatRatio(summary.averageConfidence, 0)}` },
  ];

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-5">
      {/* Control bar */}
      <section className="panel flex flex-wrap items-center justify-between gap-4 p-4">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">Fingerprint ingest</h2>
          <p className="text-xs text-muted">
            {lastScanAt
              ? <>Last scan {formatClock(lastScanAt)} · {timeAgo(lastScanAt)}</>
              : "No scan has run this session."}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {scanning && (
            <span className="chip text-brand">
              <span className="h-3 w-3 animate-spin rounded-full border border-muted border-t-brand" />
              Scanning panel…
            </span>
          )}
          <button
            type="button"
            onClick={runScan}
            disabled={scanning}
            className="btn btn-primary"
          >
            {!scanning && (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path
                  d="M3 12h2.5M18.5 12H21M12 3v2.5M12 18.5V21M6.1 6.1l1.8 1.8M16.1 16.1l1.8 1.8M17.9 6.1l-1.8 1.8M7.9 16.1l-1.8 1.8"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
                <circle cx="12" cy="12" r="3.2" stroke="currentColor" strokeWidth="1.8" />
              </svg>
            )}
            {scanning ? "Scanning…" : "Run Audio Fingerprint Scan"}
          </button>
        </div>
      </section>

      {audioError && (
        <div
          role="status"
          className="animate-rise flex items-start justify-between gap-3 rounded-lg border border-brand/40 bg-brand/10 px-3.5 py-2.5 text-xs text-brand"
        >
          <span>{audioError}</span>
          <button
            type="button"
            onClick={() => setAudioError(null)}
            className="shrink-0 opacity-70 hover:opacity-100"
            aria-label="Dismiss message"
          >
            ✕
          </button>
        </div>
      )}

      {/* Summary */}
      <dl className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className="panel p-4">
            <dt className="text-xs text-muted">{card.label}</dt>
            <dd className="mt-1.5 text-2xl font-semibold tracking-tight tabular-nums">
              {card.value}
            </dd>
            <p className="mt-1 text-[11px] text-muted">{card.hint}</p>
          </div>
        ))}
      </dl>

      {/* Station grid */}
      <section aria-labelledby="stations-heading">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id="stations-heading" className="text-sm font-semibold tracking-tight">
              Monitored stations
            </h2>
            <p className="text-xs text-muted">
              {summary.stations} feeds across Central, Eastern, Western and Northern Uganda.
            </p>
          </div>
          <p className="text-[11px] text-muted">
            {activeId
              ? "One monitor feed plays at a time."
              : "Select a station to open its monitor feed."}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {MONITORED_STATIONS.map((station) => (
            <StationCard
              key={station.id}
              station={station}
              telemetry={telemetry[station.id]}
              active={activeId === station.id}
              analyser={activeId === station.id ? analyser : null}
              volume={volumes[station.id] ?? DEFAULT_VOLUME}
              onTogglePlay={() => void togglePlay(station.id)}
              onVolumeChange={(volume) => changeVolume(station.id, volume)}
              lastDetection={lastByStation[station.id]}
            />
          ))}
        </div>
      </section>

      <DetectionFeed detections={detections} onClear={() => setDetections([])} />

      <AudioFingerprintVisualizer />

      <p className="pb-2 text-center text-[11px] text-muted">
        Station list, telemetry and detection outcomes are simulated for this prototype. Audio
        previews are locally synthesized stand-ins for the broadcast feeds.
      </p>
    </div>
  );
}
