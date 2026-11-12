"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { evidenceUrl, fmtTime } from "@/lib/db/core";
import { DEMO_MODE } from "@/lib/auth-context";
import { loadProof, type Proof } from "@/lib/db/insights";
import { EvidencePlayer } from "./EvidencePlayer";

export function ProofCard({ token }: { token: string }) {
  const [state, setState] = useState<{ kind: "loading" } | { kind: "missing" } | { kind: "error" } | { kind: "ok"; p: Proof }>({ kind: "loading" });
  useEffect(() => {
    let alive = true;
    loadProof(token)
      .then((p) => alive && setState(p ? { kind: "ok", p } : { kind: "missing" }))
      .catch(() => alive && setState({ kind: "error" }));
    return () => { alive = false; };
  }, [token]);

  if (state.kind === "loading") return <div className="glass h-72 animate-pulse" aria-busy="true" aria-label="Loading" />;
  if (state.kind !== "ok") {
    return (
      <div className="glass p-7 text-center">
        <h1 className="text-xl font-bold text-white">{state.kind === "missing" ? "This proof link isn't active" : "We couldn't load this proof"}</h1>
        <p className="mt-2 text-sm text-slate-400">
          {state.kind === "missing" ? "The owner may have turned it off, or the link is mistyped." : "Please try again in a moment."}
        </p>
        <Link href="/" className="btn-primary mt-5 inline-block">About East Sound</Link>
      </div>
    );
  }
  const p = state.p;
  const facts: [string, string][] = [
    ["Station", [p.station, p.frequency].filter(Boolean).join(" ") || "—"],
    ["Region", p.region ?? "—"],
    ["Detected", `${fmtTime(p.detected_at, true)} (Kampala time)`],
    ["Length on air", p.duration_sec ? `${Math.floor(p.duration_sec / 60)}:${String(p.duration_sec % 60).padStart(2, "0")}` : "—"],
    ["Match confidence", p.confidence != null ? `${Number(p.confidence).toFixed(1)}%` : "—"],
    ["ISRC", p.isrc || "—"],
  ];
  return (
    <article className="glass overflow-hidden">
      <div className="border-b border-slate-800 bg-emerald-500/5 p-6 sm:p-7">
        <p className="font-mono text-[11px] uppercase tracking-widest text-emerald-400">Verified airplay · East Sound</p>
        <h1 className="mt-2 text-2xl font-bold text-white sm:text-3xl">{p.title}</h1>
        <p className="mt-1 text-slate-300">{p.artist}{p.featuring ? ` ft. ${p.featuring}` : ""}</p>
      </div>
      <div className="space-y-6 p-6 sm:p-7">
        <div className="flex items-center gap-4">
          <EvidencePlayer seed={p.detected_at.length} label={`${p.title} on ${p.station ?? "radio"}`}
            resolveUrl={!DEMO_MODE && p.evidence_path ? () => evidenceUrl(p.evidence_path) : undefined} />
          <p className="text-sm text-slate-400">The 10-second clip East Sound recorded off air when this song was recognised.</p>
        </div>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
          {facts.map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs uppercase tracking-wider text-slate-500">{k}</dt>
              <dd className="mt-0.5 text-slate-100">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="border-t border-slate-800 pt-4 text-xs text-slate-500">
          Detected automatically by audio fingerprinting. Shared by the song&apos;s owner. East Sound monitors Ugandan radio 24/7 so
          artists, labels and broadcasters can see — and hear — every play. <Link href="/" className="text-emerald-400 hover:text-emerald-300">Learn more</Link>
        </p>
      </div>
    </article>
  );
}
