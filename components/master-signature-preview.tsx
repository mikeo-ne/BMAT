"use client";
import type { AudioSignature } from "@/lib/types";
import { Fingerprint, Check } from "lucide-react";
export function MasterSignaturePreview({
  signature,
}: {
  signature: AudioSignature;
}) {
  return (
    <section
      className="rounded-xl border border-brand/25 bg-brand/5 p-4"
      aria-label="Computed audio signature"
    >
      <div className="flex items-center gap-2 text-xs font-semibold text-brand">
        <Fingerprint size={15} />
        <Check size={13} />
        Audio signature processed in your browser
      </div>
      <svg
        viewBox="0 0 512 60"
        className="mt-3 h-16 w-full"
        role="img"
        aria-label="Waveform energy of the uploaded master"
      >
        {signature.waveform.map((n, i) => (
          <rect
            key={i}
            x={i * 4}
            y={30 - Math.max(1, (n / 255) * 28)}
            width="2.5"
            height={Math.max(2, (n / 255) * 56)}
            rx="1"
            fill="currentColor"
            className="text-brand"
          />
        ))}
      </svg>
      <p className="mt-2 break-all font-mono text-[9px] text-muted">
        PCM/FFT {signature.digest}
      </p>
      <p className="mt-2 text-[10px] leading-relaxed text-muted">
        Mono {signature.sampleRate.toLocaleString()} Hz ·{" "}
        {signature.analysedSec.toFixed(1)} seconds analysed · full-file SHA-256
        bound on delivery. A content signature is not proof of ownership or a
        licensed broadcast recognition match.
      </p>
    </section>
  );
}
