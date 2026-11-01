export const TIME_BANDS = ["prime", "standard", "night"] as const;
export type TimeBand = (typeof TIME_BANDS)[number];
export type WeightingPolicy = Record<TimeBand, number>;
export const DEFAULT_WEIGHTING: WeightingPolicy = {
  prime: 1.5,
  standard: 1,
  night: 0.8,
};
export const FLAT_WEIGHTING: WeightingPolicy = {
  prime: 1,
  standard: 1,
  night: 1,
};
export const TIME_BAND_META: Record<
  TimeBand,
  { label: string; hours: string; color: string }
> = {
  prime: {
    label: "Prime time",
    hours: "06:00–10:00 & 16:00–20:00 EAT",
    color: "var(--brand)",
  },
  standard: {
    label: "Standard",
    hours: "10:00–16:00 & 20:00–22:00 EAT",
    color: "var(--region-western)",
  },
  night: {
    label: "Night time",
    hours: "22:00–06:00 EAT",
    color: "var(--region-northern)",
  },
};
export function timeBandForHour(hour: number): TimeBand {
  if (!Number.isInteger(hour) || hour < 0 || hour > 23)
    throw new RangeError("Hour must be 0–23 in EAT.");
  if ((hour >= 6 && hour < 10) || (hour >= 16 && hour < 20)) return "prime";
  return hour >= 22 || hour < 6 ? "night" : "standard";
}
export function validateWeighting(policy: WeightingPolicy): boolean {
  return TIME_BANDS.every(
    (band) =>
      Number.isFinite(policy[band]) && policy[band] >= 0 && policy[band] <= 5,
  );
}
