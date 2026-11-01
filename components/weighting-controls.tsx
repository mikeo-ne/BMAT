"use client";
import { Moon, SlidersHorizontal, Sun, Sunset } from "lucide-react";
import { HelpTip } from "@/components/help-tip";
import {
  TIME_BANDS,
  TIME_BAND_META,
  type WeightingPolicy,
} from "@/lib/dayparts";
const ICONS = { prime: Sun, standard: Sunset, night: Moon };
export function WeightingControls({
  policy,
  enabled,
  onChange,
  onEnabled,
}: {
  policy: WeightingPolicy;
  enabled: boolean;
  onChange: (next: WeightingPolicy) => void;
  onEnabled: (enabled: boolean) => void;
}) {
  return (
    <section className="panel p-5" aria-labelledby="weighting-heading">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3
            id="weighting-heading"
            className="flex items-center gap-2 text-sm font-semibold"
          >
            <SlidersHorizontal size={15} className="text-brand" />
            Royalty weighting
            <HelpTip topic="weighting" />
          </h3>
          <p className="mt-1 text-[10px] text-muted">
            Base tariff × playout multiplier. Illustrative policy, in East
            Africa Time.
          </p>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-[11px] font-medium">
          <input
            type="checkbox"
            role="switch"
            aria-label="Apply time-of-day weighting"
            className="h-4 w-4 accent-brand"
            checked={enabled}
            onChange={(event) => onEnabled(event.target.checked)}
          />
          Time-of-day weighting
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {TIME_BANDS.map((band) => {
          const Icon = ICONS[band];
          return (
            <div
              key={band}
              className={`flex items-center gap-3 rounded-xl border border-line bg-surface-2/40 p-3 ${enabled ? "" : "opacity-60"}`}
            >
              <Icon
                size={17}
                className="shrink-0"
                style={{ color: TIME_BAND_META[band].color }}
              />
              <div className="min-w-0 flex-1">
                <label
                  htmlFor={`multiplier-${band}`}
                  className="block text-[11px] font-medium"
                >
                  {TIME_BAND_META[band].label}
                </label>
                <p className="mt-1 text-[9px] leading-relaxed text-muted">
                  {TIME_BAND_META[band].hours}
                </p>
              </div>
              <span className="flex items-center gap-1 text-xs text-muted">
                <input
                  id={`multiplier-${band}`}
                  type="number"
                  min={0}
                  max={5}
                  step="0.1"
                  value={policy[band]}
                  disabled={!enabled}
                  aria-label={`${TIME_BAND_META[band].label} multiplier`}
                  className="field !w-16 !bg-surface !px-2 !py-2 !text-xs"
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    if (Number.isFinite(value))
                      onChange({
                        ...policy,
                        [band]: Math.min(5, Math.max(0, value)),
                      });
                  }}
                />
                ×
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
