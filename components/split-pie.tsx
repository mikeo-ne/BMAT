"use client";

import { useState } from "react";

import type { SplitParty } from "@/lib/splits";

interface SplitPieProps {
  parties: SplitParty[];
  /** Sheet totals this much; anything other than 100 is drawn as a defect. */
  totalPct: number;
  size?: number;
}

const PALETTE = [
  "var(--brand)",
  "var(--accent)",
  "var(--region-western)",
  "var(--region-northern)",
  "var(--region-eastern)",
  "var(--region-central)",
];

/**
 * Ownership as a donut.
 *
 * Pure SVG so it is deterministic in SSR and testable without a canvas. Shares
 * are drawn against 100 rather than against the sheet total, so a sheet that
 * over-allocates visibly overflows instead of quietly renormalising.
 */
export function SplitPie({ parties, totalPct, size = 196 }: SplitPieProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const stroke = 30;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const overAllocated = totalPct > 100;

  // Precomputed so nothing is mutated during render.
  const offsets: number[] = [];
  let running = 0;
  for (const party of parties) {
    offsets.push(running);
    running += party.sharePct;
  }

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-6">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          role="img"
          aria-label={
            overAllocated
              ? `Ownership split totalling ${totalPct}% — over-allocated`
              : `Ownership split across ${parties.length} parties`
          }
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--line)"
            strokeWidth={stroke}
          />

          {parties.map((party, i) => {
            const fraction = party.sharePct / 100;
            const dash = circumference * fraction;
            const offset = -circumference * (offsets[i] / 100);

            const active = activeIndex === i;

            return (
              <circle
                key={party.id}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={PALETTE[i % PALETTE.length]}
                strokeWidth={active ? stroke + 6 : stroke}
                strokeDasharray={`${dash} ${circumference - dash}`}
                strokeDashoffset={offset}
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
                opacity={activeIndex === null || active ? 1 : 0.4}
                onMouseEnter={() => setActiveIndex(i)}
                onMouseLeave={() => setActiveIndex(null)}
                style={{ transition: "stroke-width 120ms ease, opacity 120ms ease" }}
              />
            );
          })}
        </svg>

        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          {activeIndex !== null && parties[activeIndex] ? (
            <>
              <span className="font-mono text-2xl font-semibold">
                {parties[activeIndex].sharePct}%
              </span>
              <span className="max-w-[9rem] truncate text-[11px] text-muted">
                {parties[activeIndex].name}
              </span>
            </>
          ) : (
            <>
              <span
                className="font-mono text-2xl font-semibold"
                style={{ color: overAllocated ? "#f0544f" : undefined }}
              >
                {totalPct}%
              </span>
              <span className="text-[11px] uppercase tracking-wider text-muted">
                {overAllocated ? "over-allocated" : "allocated"}
              </span>
            </>
          )}
        </div>
      </div>

      <ul className="w-full space-y-1.5 text-xs">
        {parties.map((party, i) => (
          <li
            key={party.id}
            className="flex items-center justify-between gap-3 rounded px-2 py-1"
            onMouseEnter={() => setActiveIndex(i)}
            onMouseLeave={() => setActiveIndex(null)}
            style={{
              background: activeIndex === i ? "var(--surface-2)" : "transparent",
            }}
          >
            <span className="flex min-w-0 items-center gap-2">
              <span
                className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
                style={{ background: PALETTE[i % PALETTE.length] }}
                aria-hidden
              />
              <span className="min-w-0">
                <span className="block truncate font-medium">{party.name}</span>
                <span className="block truncate text-[11px] text-muted">{party.role}</span>
              </span>
            </span>
            <span className="shrink-0 font-mono">{party.sharePct}%</span>
          </li>
        ))}

        {overAllocated ? (
          <li className="mt-2 rounded border border-line px-2 py-1.5 text-[11px] text-[#f0544f]">
            Shares total {totalPct}%. The sheet cannot be executed until {totalPct - 100}% is clawed
            back.
          </li>
        ) : null}
      </ul>
    </div>
  );
}
