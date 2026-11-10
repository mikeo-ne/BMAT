"use client";

import { useEffect, useState } from "react";

import {
  cancelStationRequest,
  loadStationSetup,
  submitStationRequest,
  type ClaimableStation,
  type StationRequestRow,
} from "@/lib/db/broadcaster";
import { useLoad } from "@/lib/db/core";
import { REGIONS, slugPreview } from "@/lib/station-request";
import { cx } from "@/lib/safe";
import { Badge, Section } from "@/components/dashboard/ui";

const STATUS_TONE = { pending: "warn", approved: "ok", rejected: "bad", cancelled: "bad" } as const;

/**
 * Station onboarding.
 *
 * Without a linked station a broadcaster has no dashboard at all, which used to
 * be a dead end ("ask East Sound"). Now they can claim a station already in the
 * panel or add a new one — including the stream URL the monitor will use — and
 * watch the request move from pending to approved.
 */
export function StationSetup({ hasStation }: { hasStation: boolean }) {
  const state = useLoad(() => loadStationSetup(), []);
  const [mode, setMode] = useState<"claim" | "new">("claim");
  const [stationId, setStationId] = useState("");
  const [name, setName] = useState("");
  const [frequency, setFrequency] = useState("");
  const [region, setRegion] = useState<string>("Central");
  const [kind, setKind] = useState<"radio" | "tv">("radio");
  const [streamUrl, setStreamUrl] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const requests = state.data?.requests ?? [];
  const claimable = state.data?.claimable ?? [];
  const pending = requests.filter((r) => r.status === "pending");
  const selected: ClaimableStation | undefined = claimable.find((s) => s.id === stationId);
  const slug = name ? slugPreview(name, frequency) : "";

  useEffect(() => {
    setError(null);
    setMessage(null);
  }, [mode]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await submitStationRequest({
        mode,
        stationId: mode === "claim" ? stationId : undefined,
        name: mode === "new" ? name : undefined,
        frequency: mode === "new" ? frequency : undefined,
        region: mode === "new" ? region : undefined,
        kind,
        streamUrl,
        note,
      });
      setMessage(
        mode === "claim"
          ? "Request sent. A CMO will confirm the station belongs to you, then the dashboard fills in."
          : "Station submitted. A CMO reviews it, then the monitor starts listening to your stream.",
      );
      setStationId("");
      setName("");
      setFrequency("");
      setStreamUrl("");
      setNote("");
      state.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send the request.");
    } finally {
      setBusy(false);
    }
  };

  const cancel = async (id: string) => {
    try {
      await cancelStationRequest(id);
      state.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not cancel the request.");
    }
  };

  if (state.loading) {
    return (
      <Section id="station" title="Station & Stream">
        <p className="text-sm text-slate-500">Loading your station…</p>
      </Section>
    );
  }

  return (
    <Section id="station" title={hasStation ? "Add or claim another station" : "Connect your station"}>
      {!hasStation && (
        <div className="mb-4 rounded-xl border border-emerald-400/25 bg-emerald-400/5 p-4">
          <p className="text-sm text-emerald-200">
            No station is linked to your account yet. Pick your station from the panel below, or add it if it is
            not there. Nothing is monitored under your name until a CMO approves it.
          </p>
        </div>
      )}

      <div className="mb-3 flex gap-2" role="group" aria-label="How to connect">
        {(["claim", "new"] as const).map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={mode === m}
            onClick={() => setMode(m)}
            className={cx(
              "rounded-lg border px-3 py-1.5 text-xs font-medium transition",
              mode === m ? "border-emerald-400/50 bg-emerald-400/10 text-emerald-300" : "border-slate-800 text-slate-400 hover:text-white",
            )}
          >
            {m === "claim" ? "This station is already listed" : "Add a new station"}
          </button>
        ))}
      </div>

      {mode === "claim" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="label">Station in the panel</span>
            <select className="input" value={stationId} onChange={(e) => setStationId(e.target.value)} aria-label="Station to claim">
              <option value="">Choose your station…</option>
              {claimable.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.frequency ? ` · ${s.frequency}` : ""}
                  {s.region ? ` · ${s.region}` : ""}
                  {s.kind === "tv" ? " · TV" : ""}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs text-slate-500">
              {claimable.length} unclaimed stations. Only name, region and frequency are shown — no playout data.
            </span>
          </label>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="label">Station name</span>
            <input className="input" placeholder="e.g. Next Radio" value={name} onChange={(e) => setName(e.target.value)} />
            {slug && <span className="mt-1 block font-mono text-[11px] text-slate-500">Panel id: {slug}</span>}
          </label>
          <label className="block">
            <span className="label">Frequency (optional)</span>
            <input className="input" placeholder="106.1" value={frequency} onChange={(e) => setFrequency(e.target.value)} />
          </label>
          <label className="block">
            <span className="label">Region</span>
            <select className="input" value={region} onChange={(e) => setRegion(e.target.value)}>
              {REGIONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="label">Type</span>
          <select className="input" value={kind} onChange={(e) => setKind(e.target.value as "radio" | "tv")}>
            <option value="radio">Radio</option>
            <option value="tv">TV</option>
          </select>
        </label>
        <label className="block">
          <span className="label">Stream URL {kind === "tv" ? "(HLS .m3u8)" : "(optional)"}</span>
          <input
            className="input"
            placeholder={kind === "tv" ? "https://…/playlist.m3u8" : "https://…/stream.mp3"}
            value={streamUrl}
            onChange={(e) => setStreamUrl(e.target.value)}
          />
          <span className="mt-1 block text-xs text-slate-500">
            {mode === "claim"
              ? "Leave blank if the panel already has a working stream for this station."
              : "Without a URL the station is added but not monitored until one is supplied."}
          </span>
        </label>
        <label className="block sm:col-span-2">
          <span className="label">Anything else? (optional)</span>
          <input className="input" placeholder="Contact name, phone, who owns the stream…" value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
      </div>

      {selected && mode === "claim" && (
        <p className="mt-2 text-xs text-slate-400">
          Claiming <span className="font-medium text-white">{selected.name}</span>
          {selected.frequency ? ` · ${selected.frequency}` : ""}
          {selected.region ? ` · ${selected.region}` : ""}.
        </p>
      )}

      {error && <p role="alert" className="mt-3 text-sm text-rose-300">{error}</p>}
      {message && <p className="mt-3 text-sm text-emerald-300">{message}</p>}

      <div className="mt-4">
        <button type="button" className="btn-primary !py-2" onClick={submit} disabled={busy}>
          {busy ? "Sending…" : mode === "claim" ? "Request this station" : "Submit station"}
        </button>
      </div>

      {requests.length > 0 && (
        <div className="mt-6">
          <p className="label">Your requests</p>
          <div className="divide-y divide-slate-800/70 rounded-xl border border-slate-800">
            {requests.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                <span className="font-medium text-white">{r.name ?? "Station"}</span>
                <span className="text-xs text-slate-500">
                  {[r.frequency, r.region, r.kind === "tv" ? "TV" : "Radio"].filter(Boolean).join(" · ")}
                </span>
                <Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge>
                <span className="font-mono text-[11px] text-slate-500">{r.createdAt}</span>
                {r.reviewNote && <span className="text-xs text-slate-400">— {r.reviewNote}</span>}
                {r.status === "pending" && (
                  <button type="button" className="ml-auto text-xs text-slate-400 underline hover:text-white" onClick={() => cancel(r.id)}>
                    Cancel
                  </button>
                )}
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Pending requests are reviewed by a CMO. Approved stations appear on your dashboard immediately, with
            the monitor&apos;s real status (online, reconnecting, or no stream URL).
          </p>
        </div>
      )}
    </Section>
  );
}

export type { StationRequestRow };
