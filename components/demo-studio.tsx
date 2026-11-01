"use client";
import { useEffect, useRef, useState } from "react";
import {
  CheckCheck,
  FlaskConical,
  Headphones,
  MessageCircle,
  Play,
  Radio,
  Send,
} from "lucide-react";
import { Dialog } from "@/components/dialog";
import {
  DEMO_ORGANISATION,
  DEMO_RECORDINGS,
  DEMO_SAMPLE_URL,
  demoAlert,
  type DemoSpin,
} from "@/lib/demo-data";
import { FM_STATIONS } from "@/lib/regions";
import { formatEatClock } from "@/lib/format";
export function DemoStudio({
  stationIds,
  phoneOnly = false,
}: {
  stationIds?: string[];
  phoneOnly?: boolean;
}) {
  const stations = FM_STATIONS.filter((s) =>
    stationIds
      ? stationIds.includes(s.id)
      : ["capital-kla", "cbs-kla"].includes(s.id),
  );
  const [recording, setRecording] = useState<string>(DEMO_RECORDINGS[0].id),
    [stationId, setStationId] = useState(
      stations.find((s) => s.id === "capital-kla")?.id ?? stations[0]?.id ?? "",
    ),
    [spins, setSpins] = useState<DemoSpin[]>([]),
    [messages, setMessages] = useState<DemoSpin[]>([]),
    [evidence, setEvidence] = useState<DemoSpin | null>(null),
    [typing, setTyping] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);
  function log() {
    const track = DEMO_RECORDINGS.find((t) => t.id === recording)!,
      station = stations.find((s) => s.id === stationId);
    if (!station) return;
    const spin: DemoSpin = {
      id: crypto.randomUUID(),
      source: "demo",
      title: track.title,
      artist: track.artist,
      station: station.name,
      location: station.location,
      at: new Date().toISOString(),
    };
    setSpins((old) => [spin, ...old].slice(0, 8));
    setTyping(true);
    timers.current.push(
      setTimeout(() => {
        setMessages((old) => [...old, spin].slice(-8));
        setTyping(false);
      }, 450),
    );
  }
  return (
    <section
      className="panel overflow-hidden"
      aria-label="Separate demonstration sandbox"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line bg-amber-400/5 p-5">
        <div>
          <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-amber-200">
            <FlaskConical size={14} />
            Demonstration sandbox
          </p>
          <h2 className="mt-2 text-lg font-semibold">
            Hear the sample. Preview an alert.
          </h2>
          <p className="mt-2 max-w-2xl text-[11px] leading-relaxed text-muted">
            Mukisa Collective, Ray Bwete, Capital FM, CBS FM and{" "}
            {DEMO_ORGANISATION} are retained as separate demonstration data.
            This sandbox creates no verified airplay, royalties, identity
            affiliation or real WhatsApp/webhook delivery.
          </p>
        </div>
        <span className="chip text-amber-200">
          Demo records never enter live totals
        </span>
      </div>
      <div
        className={`grid gap-6 p-4 sm:p-6 ${phoneOnly ? "lg:grid-cols-[minmax(0,1fr)_300px]" : "xl:grid-cols-[minmax(0,1fr)_300px]"}`}
      >
        <div className="min-w-0">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs">
              Demo recording
              <select
                className="field mt-2"
                aria-label="Demo recording"
                value={recording}
                onChange={(e) => setRecording(e.target.value)}
              >
                {DEMO_RECORDINGS.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title} · {t.artist}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs">
              Station scenario
              <select
                className="field mt-2"
                aria-label="Demo station scenario"
                value={stationId}
                onChange={(e) => setStationId(e.target.value)}
              >
                {stations.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} · {s.region}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="mt-5 rounded-xl border border-line bg-background/40 p-4">
            <p className="flex items-center gap-2 text-xs font-semibold">
              <Headphones size={15} className="text-brand" />
              Embedded sample player
            </p>
            <audio
              controls
              preload="metadata"
              src={DEMO_SAMPLE_URL}
              aria-label="Ten-second generated demonstration sample"
              className="mt-4 h-10 w-full"
            />
            <p className="mt-3 text-[10px] leading-relaxed text-muted">
              Exactly ten seconds of generated instrumental tones. Not the
              actual “Mulongo” recording, a station feed or evidence of a
              broadcast. Licensed native/HLS feeds are connected separately in
              Monitoring.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-primary mt-4 !text-xs"
            onClick={log}
            disabled={!stations.length}
          >
            <Play size={13} />
            Log demo spin & preview WhatsApp
          </button>
          <p className="mt-2 text-[10px] text-muted">
            An in-memory preview, not the server’s live notification outbox.
          </p>
          {!phoneOnly && (
            <div className="mt-5 overflow-x-auto rounded-xl border border-line">
              <table className="w-full min-w-[420px] text-left text-[10px]">
                <caption className="p-3 text-left text-xs font-semibold">
                  Demonstration log · {spins.length} simulated spins
                </caption>
                <thead>
                  <tr className="border-y border-line bg-background/40">
                    <th className="p-3">Recording</th>
                    <th className="p-3">Station</th>
                    <th className="p-3">Local status</th>
                    <th className="p-3">Audio</th>
                  </tr>
                </thead>
                <tbody>
                  {spins.map((spin) => (
                    <tr
                      className="border-b border-line last:border-0"
                      key={spin.id}
                    >
                      <td className="p-3">
                        {spin.title}
                        <span className="mt-1 block text-muted">
                          {spin.artist}
                        </span>
                      </td>
                      <td className="p-3">{spin.station}</td>
                      <td className="p-3 text-amber-200">Demo only</td>
                      <td className="p-3">
                        <button
                          type="button"
                          className="btn btn-ghost !px-2 !text-[10px]"
                          aria-label={`Listen to demo evidence for ${spin.title}`}
                          onClick={() => setEvidence(spin)}
                        >
                          <Headphones size={12} />
                          10s evidence
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!spins.length && (
                    <tr>
                      <td colSpan={4} className="p-5 text-center text-muted">
                        Log a demonstration spin to open an audible sample.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div
          className="mx-auto flex h-[510px] w-full max-w-[290px] flex-col overflow-hidden rounded-[2.3rem] border-[7px] border-[#293238] bg-[#0b141a] shadow-xl"
          aria-label="WhatsApp phone simulator"
        >
          <div className="bg-[#202c33] px-4 pb-3 pt-2">
            <div className="mx-auto mb-4 h-4 w-24 rounded-full bg-black/60" />
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand/20 text-brand">
                <Radio size={17} />
              </span>
              <div>
                <p className="text-xs font-semibold">East Sound</p>
                <p className="mt-1 text-[9px] text-emerald-200">
                  WhatsApp simulator · not connected
                </p>
              </div>
            </div>
          </div>
          <div
            className="flex-1 space-y-3 overflow-y-auto bg-[radial-gradient(#ffffff09_1px,transparent_1px)] bg-[length:16px_16px] p-3"
            aria-live="polite"
          >
            <p className="mx-auto w-fit rounded-md bg-[#182229] px-3 py-1.5 text-[9px] text-amber-100">
              Local preview · no message is sent
            </p>
            {!messages.length && !typing && (
              <p className="rounded-xl rounded-tl-none bg-[#202c33] p-3 text-[11px] leading-relaxed text-slate-200">
                Ready for a first spin? Use the demo button to see your artist
                alert here.
              </p>
            )}
            {messages.map((message) => (
              <div
                key={message.id}
                className="ml-3 rounded-xl rounded-tr-none bg-[#005c4b] p-3 text-[11px] leading-relaxed text-white"
              >
                <p className="font-medium">{demoAlert(message)}</p>
                <p className="mt-2 text-[10px] text-emerald-100">
                  {message.artist} · simulated event
                </p>
                <p className="mt-2 flex justify-end gap-1 text-[9px] text-emerald-100/70">
                  {formatEatClock(message.at)}
                  <CheckCheck size={12} />
                  <span>Previewed locally</span>
                </p>
              </div>
            ))}
            {typing && (
              <p className="w-fit rounded-xl bg-[#202c33] px-4 py-2 text-xs text-slate-300">
                Preparing preview…
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 bg-[#202c33] p-3 text-slate-400">
            <MessageCircle size={18} />
            <span className="flex-1 rounded-full bg-[#2a3942] px-3 py-2 text-[10px]">
              Simulation only
            </span>
            <Send size={15} className="text-brand" />
          </div>
        </div>
      </div>
      {evidence && (
        <Dialog
          title="10-second demonstration evidence"
          onClose={() => setEvidence(null)}
        >
          <p className="text-sm font-semibold">
            {evidence.title} · {evidence.station}
          </p>
          <p className="mt-2 text-xs text-amber-200">
            Simulated log · generated sample, not a captured broadcast
          </p>
          <audio
            controls
            preload="metadata"
            src={DEMO_SAMPLE_URL}
            aria-label="Ten-second demonstration evidence"
            className="mt-5 h-11 w-full"
          />
          <p className="mt-4 text-[11px] leading-relaxed text-muted">
            This ten-second sample exercises the evidence-player workflow. Real
            captured records require their own licensed clip URL, SHA-256 and
            capture provenance, and never borrow this sample.
          </p>
        </Dialog>
      )}
    </section>
  );
}
