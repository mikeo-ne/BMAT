"use client";

import { useEffect, useState, type ReactNode } from "react";
import { cx, safeArray, safeNumber, safeStorage } from "@/lib/safe";

export function Section({ id, title, kicker, actions, children }: { id: string; title: string; kicker?: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          {kicker && <p className="font-mono text-[11px] uppercase tracking-widest text-emerald-400/80">{kicker}</p>}
          <h2 className="text-lg font-semibold text-white">{title}</h2>
        </div>
        {actions}
      </div>
      <div className="glass p-4 sm:p-5">{children}</div>
    </section>
  );
}

export function StatGrid({ items }: { items: { label: string; value: string; hint?: string; tone?: "ok" | "warn" | "bad" }[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {safeArray(items).map((s) => (
        <div key={s.label} className="glass p-4">
          <p className="text-xs uppercase tracking-wider text-slate-500">{s.label}</p>
          <p
            className={cx(
              "mt-1 font-mono text-2xl font-bold",
              s.tone === "bad" ? "text-rose-300" : s.tone === "warn" ? "text-amber-300" : "text-emerald-300 glow-text",
            )}
          >
            {s.value}
          </p>
          {s.hint && <p className="mt-0.5 text-xs text-slate-500">{s.hint}</p>}
        </div>
      ))}
    </div>
  );
}

export type Column<T> = { key: string; header: string; render: (row: T) => ReactNode; className?: string };

/** Crash-proof table: tolerates null rows and renders an empty state. */
export function DataTable<T>({ columns, rows, rowKey, empty = "No records yet.", maxHeight }: {
  columns: Column<T>[];
  rows: T[] | null | undefined;
  rowKey: (row: T, i: number) => string;
  empty?: string;
  maxHeight?: number;
}) {
  const list = safeArray(rows);
  return (
    <div className="-mx-4 overflow-x-auto sm:-mx-5" style={maxHeight ? { maxHeight, overflowY: "auto" } : undefined}>
      <table className="min-w-full">
        <thead className="sticky top-0 bg-slate-900/95 backdrop-blur">
          <tr>
            {safeArray(columns).map((c) => (
              <th key={c.key} className={cx("th first:pl-4 sm:first:pl-5", c.className)}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/70">
          {list.map((row, i) => (
            <tr key={rowKey(row, i)} className="transition hover:bg-slate-800/30">
              {safeArray(columns).map((c) => (
                <td key={c.key} className={cx("td first:pl-4 sm:first:pl-5", c.className)}>
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
          {list.length === 0 && (
            <tr>
              <td colSpan={safeArray(columns).length} className="px-5 py-8 text-center text-sm text-slate-500">
                {empty}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function Badge({ tone = "neutral", children }: { tone?: "ok" | "warn" | "bad" | "neutral" | "info"; children: ReactNode }) {
  const map = {
    ok: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
    warn: "border-amber-400/30 bg-amber-400/10 text-amber-300",
    bad: "border-rose-400/30 bg-rose-400/10 text-rose-300",
    info: "border-sky-400/30 bg-sky-400/10 text-sky-300",
    neutral: "border-slate-700 bg-slate-800/50 text-slate-300",
  };
  return <span className={cx("inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold", map[tone])}>{children}</span>;
}

export function BarChart({ data, format = (v) => String(v), height = 180 }: { data: { label: string; value: number }[]; format?: (v: number) => string; height?: number }) {
  const list = safeArray(data);
  const max = Math.max(1, ...list.map((d) => safeNumber(d.value)));
  return (
    <div className="flex items-end gap-2 sm:gap-4" style={{ height }} role="img" aria-label="Bar chart">
      {list.map((d) => {
        const pct = (safeNumber(d.value) / max) * 100;
        return (
          <div key={d.label} className="group flex h-full flex-1 flex-col items-center justify-end gap-2">
            <span className="text-[10px] font-mono text-slate-400 opacity-0 transition group-hover:opacity-100">{format(d.value)}</span>
            <div className="w-full rounded-t-md bg-gradient-to-t from-emerald-600/40 to-emerald-400 shadow-glow-sm transition group-hover:to-emerald-300" style={{ height: `${Math.max(2, pct)}%` }} />
            <span className="text-xs text-slate-500">{d.label}</span>
          </div>
        );
      })}
    </div>
  );
}

export function LineChart({ values, height = 160, label }: { values: number[]; height?: number; label: string }) {
  const list = safeArray(values).map((v) => safeNumber(v));
  if (list.length < 2) return <p className="text-sm text-slate-500">Not enough data yet.</p>;
  const w = 600;
  const max = Math.max(...list, 1);
  const pts = list.map((v, i) => [(i / (list.length - 1)) * w, height - (v / max) * (height - 16) - 8] as const);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${height}`} className="w-full" role="img" aria-label={label} preserveAspectRatio="none" style={{ height }}>
      <defs>
        <linearGradient id="lc-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#34d399" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#34d399" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L${w},${height} L0,${height} Z`} fill="url(#lc-fill)" />
      <path d={line} fill="none" stroke="#34d399" strokeWidth="2.5" vectorEffect="non-scaling-stroke" style={{ filter: "drop-shadow(0 0 6px rgba(52,211,153,.6))" }} />
    </svg>
  );
}

export function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 py-2.5">
      <span>
        <span className="block text-sm font-medium text-white">{label}</span>
        {description && <span className="block text-xs text-slate-500">{description}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cx("relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition", checked ? "bg-emerald-400 shadow-glow-sm" : "bg-slate-700")}
      >
        <span className={cx("absolute top-0.5 h-5 w-5 rounded-full bg-white transition", checked ? "left-[22px]" : "left-0.5")} />
      </button>
    </label>
  );
}

/** useState mirrored to localStorage — reads only after mount to avoid hydration mismatch. */
export function usePersistentState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(initial);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setValue(safeStorage.get<T>(key, initial));
    setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useEffect(() => {
    if (ready) safeStorage.set(key, value);
  }, [key, value, ready]);
  return [value, setValue] as const;
}

/** Loading skeleton, readable error with retry, then the content. */
export function LoadGate<T>({ state, children }: {
  state: { data: T | null; error: string | null; loading: boolean; reload: () => void };
  children: (data: T) => ReactNode;
}) {
  if (state.error && !state.data) {
    return (
      <div role="alert" className="glass flex flex-wrap items-center justify-between gap-3 border-rose-500/30 p-5">
        <div>
          <p className="font-semibold text-rose-200">We couldn&apos;t load your workspace.</p>
          <p className="mt-1 text-sm text-slate-400">{state.error}</p>
        </div>
        <button type="button" className="btn-ghost !py-2" onClick={state.reload}>Try again</button>
      </div>
    );
  }
  if (!state.data) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Loading">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <div key={i} className="glass h-20 animate-pulse" />)}
        </div>
        <div className="glass h-64 animate-pulse" />
        <div className="glass h-48 animate-pulse" />
      </div>
    );
  }
  return <>{children(state.data)}</>;
}

/** Small inline status for save actions. */
export function SaveNote({ state }: { state: { kind: "idle" | "saving" | "saved" | "error"; msg?: string } }) {
  if (state.kind === "idle") return null;
  return (
    <span role="status" className={cx("text-xs", state.kind === "error" ? "text-rose-300" : state.kind === "saved" ? "text-emerald-300" : "text-slate-400")}>
      {state.kind === "saving" ? "Saving…" : state.kind === "saved" ? "Saved" : state.msg ?? "Couldn't save"}
    </span>
  );
}
