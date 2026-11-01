"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AudioLines,
  CircleAlert,
  Fingerprint,
  Headphones,
  ShieldCheck,
} from "lucide-react";
import { Dialog } from "@/components/dialog";
import { demoEvidenceDataUri, EVIDENCE_SECONDS } from "@/lib/evidence";
import { verifyCapturedEvidence } from "@/lib/evidence-client";
import { eatDate, eatTime, type BroadcastSpin } from "@/lib/playout";

export function EvidenceModal({
  spin,
  onClose,
}: {
  spin: BroadcastSpin;
  onClose: () => void;
}) {
  const captured = spin.source === "captured" && !!spin.evidence;
  const demo = spin.source === "demo";
  const initialSrc = useMemo(
    () =>
      captured
        ? spin.evidence!.url
        : demo
          ? demoEvidenceDataUri(spin.id)
          : undefined,
    [captured, demo, spin.evidence, spin.id],
  );
  const [error, setError] = useState<string | null>(null);
  const [verification, setVerification] = useState<
    "idle" | "checking" | "verified" | "mismatch" | "unavailable"
  >("idle");
  const [verifiedSrc, setVerifiedSrc] = useState<string | null>(null);
  const media = useRef<HTMLAudioElement | null>(null);
  const request = useRef<AbortController | null>(null);
  const objectUrl = useRef<string | null>(null);
  useEffect(
    () => () => {
      request.current?.abort();
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    },
    [],
  );
  function validLength(media: HTMLAudioElement) {
    return (
      Number.isFinite(media.duration) &&
      Math.abs(media.duration - EVIDENCE_SECONDS) <= 0.25
    );
  }
  async function verify() {
    if (!captured) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setVerification("checking");
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const result = await verifyCapturedEvidence(
        spin.evidence!.url,
        spin.evidence!.sha256,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      if (result.status === "verified") {
        if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
        objectUrl.current = URL.createObjectURL(result.blob);
        setVerifiedSrc(objectUrl.current);
      }
      if (result.status === "mismatch") media.current?.pause();
      setVerification(result.status);
    } catch {
      // A timeout or missing CORS response is NOT a verified digest.
      setVerification("unavailable");
    } finally {
      clearTimeout(timeout);
    }
  }
  return (
    <Dialog title="Audible Evidence Snippet" onClose={onClose}>
      <div className="flex items-start gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand">
          <Headphones size={23} />
        </span>
        <div className="min-w-0">
          <span className="eyebrow">
            {spin.stationName} · {spin.medium}
          </span>
          <h3 className="mt-1 truncate text-xl font-semibold tracking-tight">
            {spin.title ?? "Unidentified audio"}
          </h3>
          <p className="mt-1 text-xs text-muted">
            {spin.primaryArtist ?? "Awaiting identification"}
          </p>
        </div>
      </div>
      <div className="mt-5 rounded-xl border border-line bg-surface-2/60 p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-[11px] font-medium">
            <AudioLines size={14} />
            {EVIDENCE_SECONDS}-second{" "}
            {captured
              ? "capture excerpt"
              : demo
                ? "demo excerpt"
                : "evidence required"}
          </span>
          <span className={`chip ${captured ? "text-brand" : "text-muted"}`}>
            {captured
              ? "Capture attached"
              : demo
                ? "Synthesized audio"
                : "No capture attached"}
          </span>
        </div>
        {initialSrc ? (
          <audio
            ref={media}
            aria-label={`${EVIDENCE_SECONDS}-second ${captured ? "broadcast evidence" : "synthesized demo"} from ${spin.stationName}`}
            controls
            src={verifiedSrc ?? initialSrc}
            preload="metadata"
            className="w-full"
            controlsList="nodownload noplaybackrate"
            onError={() =>
              setError(
                "The supplied excerpt could not be loaded. Check its URL, browser audio support and provider access policy.",
              )
            }
            onLoadedMetadata={(event) => {
              if (!validLength(event.currentTarget)) {
                event.currentTarget.pause();
                setError(
                  "Playback blocked: the supplied asset is not a ten-second excerpt. Ask the capture provider for a correctly trimmed clip.",
                );
              } else setError(null);
            }}
            onPlay={(event) => {
              if (
                !validLength(event.currentTarget) ||
                verification === "mismatch"
              ) {
                event.currentTarget.pause();
                setError(
                  "Playback blocked: review the excerpt duration or digest mismatch.",
                );
              }
            }}
            onTimeUpdate={(event) => {
              if (event.currentTarget.currentTime >= EVIDENCE_SECONDS)
                event.currentTarget.pause();
            }}
            onSeeking={(event) => {
              if (event.currentTarget.currentTime > EVIDENCE_SECONDS)
                event.currentTarget.currentTime = EVIDENCE_SECONDS;
            }}
          />
        ) : (
          <p className="text-xs text-muted">
            No captured excerpt was supplied. East Sound will not substitute
            generated audio for this broadcast.
          </p>
        )}
        {error && (
          <p role="alert" className="mt-2 text-xs text-red-500">
            {error}
          </p>
        )}
      </div>
      <dl className="mt-5 grid grid-cols-2 gap-x-5 gap-y-4 text-xs">
        <div>
          <dt className="text-[10px] text-muted">Broadcast timestamp</dt>
          <dd className="mt-1 font-medium">
            {eatDate(spin.detectedAt)} · {eatTime(spin.detectedAt)} EAT
          </dd>
        </div>
        <div>
          <dt className="text-[10px] text-muted">Match confidence</dt>
          <dd className="mt-1 flex items-center gap-1 font-medium">
            <Fingerprint size={12} className="text-brand" />
            {(spin.confidence * 100).toFixed(1)}% {demo && "(simulated)"}
          </dd>
        </div>
        <div>
          <dt className="text-[10px] text-muted">Recording identifier</dt>
          <dd className="mt-1 font-mono text-[11px]">
            {spin.isrc ||
              (spin.trackId ? "ISRC not supplied" : "No catalogue match")}
          </dd>
        </div>
        <div>
          <dt className="text-[10px] text-muted">Log reference</dt>
          <dd className="mt-1 break-all font-mono text-[10px]">{spin.id}</dd>
        </div>
      </dl>
      {captured ? (
        <div className="mt-5 space-y-3 rounded-xl border border-brand/20 bg-brand/5 p-3 text-[11px] leading-relaxed">
          <p className="flex gap-2">
            <ShieldCheck size={15} className="shrink-0 text-brand" />
            <span>
              Ingester-supplied SHA-256:{" "}
              <code className="break-all">{spin.evidence!.sha256}</code>. A
              matching digest verifies downloaded bytes, not the recording’s
              identity, capture provenance, rights or broadcaster attribution.
            </span>
          </p>
          <button
            type="button"
            className="btn btn-secondary !text-[11px]"
            disabled={
              verification === "checking" || verification === "verified"
            }
            onClick={() => void verify()}
          >
            <ShieldCheck size={13} />
            {verification === "checking"
              ? "Verifying downloaded bytes…"
              : verification === "verified"
                ? "Downloaded bytes match SHA-256"
                : "Verify downloaded SHA-256"}
          </button>
          <p role="status">
            {verification === "verified"
              ? "The player now uses the verified downloaded bytes. Independently review provenance before relying on this record."
              : verification === "mismatch"
                ? "Digest mismatch. Playback is blocked; do not rely on this asset."
                : verification === "unavailable"
                  ? "Verification unavailable (access, timeout, size limit or provider CORS). No successful verification is assumed."
                  : "Verification is an explicit CORS download, bounded to 16 MB and 15 seconds. It does not run automatically."}
          </p>
        </div>
      ) : demo ? (
        <div className="mt-5 flex gap-2.5 rounded-xl border border-accent/30 bg-accent/5 p-3.5 text-[11px] leading-relaxed text-muted">
          <CircleAlert size={16} className="mt-0.5 shrink-0" />
          <p>
            <strong>Demonstration audio, not captured evidence.</strong> No
            broadcast recording is attached to this test log. The generated tone
            is a player preview and cannot independently verify the track or
            airplay. A licensed stream-capture service is required for real
            evidence.
          </p>
        </div>
      ) : null}
    </Dialog>
  );
}
