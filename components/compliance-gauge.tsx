import { formatShare } from "@/lib/format";

interface ComplianceGaugeProps {
  /** 0-1 fulfilment against the contract. */
  rate: number;
  /** Contracted spots. */
  contracted: number;
  /** Verified in-window spots. */
  fulfilled: number;
  /** Spots that aired but breached the terms. */
  breached: number;
  /** Spots that never aired. */
  missed: number;
  size?: number;
  label?: string;
}

/**
 * Contract fulfilment as a dial.
 *
 * Pure SVG so it renders identically in SSR and on the client, and so it is
 * testable without a canvas. The arc is drawn with a stroke-dasharray on a
 * single circle rather than a path, which keeps the geometry to one number.
 */
export function ComplianceGauge({
  rate,
  contracted,
  fulfilled,
  breached,
  missed,
  size = 168,
  label = "Contract fulfilment",
}: ComplianceGaugeProps) {
  const stroke = 14;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(1, rate));

  // A 270° sweep, so the gap sits at the bottom like a real dial.
  const sweep = 0.75;
  const arc = circumference * sweep;
  const filled = arc * clamped;

  const tone = clamped >= 0.9 ? "var(--accent)" : clamped >= 0.75 ? "var(--brand)" : "#f0544f";

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          role="img"
          aria-label={`${label}: ${formatShare(clamped)} fulfilled`}
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--line)"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${arc} ${circumference}`}
            transform={`rotate(135 ${size / 2} ${size / 2})`}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={tone}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${filled} ${circumference}`}
            transform={`rotate(135 ${size / 2} ${size / 2})`}
          />
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-mono text-3xl font-semibold tracking-tight" style={{ color: tone }}>
            {formatShare(clamped)}
          </span>
          <span className="text-[11px] uppercase tracking-wider text-muted">fulfilled</span>
        </div>
      </div>

      <dl className="grid w-full grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
        <div className="flex items-center justify-between gap-2">
          <dt className="text-muted">Contracted</dt>
          <dd className="font-mono">{contracted}</dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="text-muted">Verified</dt>
          <dd className="font-mono text-accent">{fulfilled}</dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="text-muted">Breached</dt>
          <dd className="font-mono text-brand">{breached}</dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="text-muted">Never aired</dt>
          <dd className="font-mono" style={{ color: missed > 0 ? "#f0544f" : undefined }}>
            {missed}
          </dd>
        </div>
      </dl>
    </div>
  );
}
