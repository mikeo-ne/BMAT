export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(Math.round(value));
}

/** 12400 -> "12.4K", 1840000 -> "1.84M" */
export function formatCompact(value: number): string {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(
    value,
  );
}

export function formatPercent(value: number | null, digits = 1): string {
  if (value === null || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${(value * 100).toFixed(digits)}%`;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** i;
  const fixed = value.toFixed(value >= 10 || i === 0 ? 0 : 1);
  // "2.0 KB" reads worse than "2 KB"; keep the decimal only when it carries info.
  const trimmed = fixed.endsWith(".0") ? fixed.slice(0, -2) : fixed;
  return `${trimmed} ${units[i]}`;
}

/** 214.6 -> "3:35" */
export function formatDuration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return "—";
  const total = Math.round(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

/** "2026-04-17" -> "17 Apr 2026" */
export function formatDate(iso: string): string {
  const parsed = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function formatDateTime(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

/** Today's date as an ISO yyyy-mm-dd string (UTC). */
export function todayIso(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? "")) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** "07 April" style label for a yyyy-mm-dd day, for chart axes. */
export function dayLabel(isoDay: string): string {
  const parsed = new Date(`${isoDay}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return isoDay;
  return parsed.toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" });
}

export function lastNDaysIso(n: number, from: Date = new Date()): string[] {
  const base = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(base);
    d.setUTCDate(base.getUTCDate() - (n - 1 - i));
    return d.toISOString().slice(0, 10);
  });
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "??";
}

/** "14:03:52" in UTC — detection feed timestamps. */
export function formatClock(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "--:--:--";
  return parsed.toISOString().slice(11, 19);
}

/** "just now", "3s ago", "4m ago", "2h ago", "3d ago". */
export function timeAgo(iso: string, now: Date = new Date()): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "—";

  const seconds = Math.max(0, Math.round((now.getTime() - parsed.getTime()) / 1000));

  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86_400)}d ago`;
}

/** 0.87 -> "87%" */
export function formatRatio(value: number, digits = 0): string {
  if (!Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}

export function formatLatency(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "—";
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`;
}

/** Last n calendar months as "YYYY-MM", oldest first, ending with this month. */
export function lastNMonths(n: number, from: Date = new Date()): string[] {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() - (n - 1 - i), 1));
    return d.toISOString().slice(0, 7);
  });
}

/** "2026-08" -> "Aug 2026" */
export function formatPeriod(period: string): string {
  const parsed = new Date(`${period}-01T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return period;
  return parsed.toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
}

/** "2026-08-01T00:00:00Z" for the first day of a "YYYY-MM" period. */
export function periodStartIso(period: string): string {
  return `${period}-01T00:00:00Z`;
}

/** 1234567.891 -> "1,234,567.89" */
export function formatCurrency(value: number, digits = 0): string {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}
