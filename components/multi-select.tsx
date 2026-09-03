"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export interface MultiSelectOption {
  value: string;
  label: string;
  /** Secondary line, e.g. a region or a station tier. */
  hint?: string;
  /** Pre-computed count shown right-aligned. */
  count?: number;
}

interface MultiSelectProps {
  label: string;
  options: MultiSelectOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  /** Placeholder for the button when nothing is selected. */
  allLabel: string;
  searchable?: boolean;
}

/** Dropdown multi-select with search, used for every CMO audit filter. */
export function MultiSelect({
  label,
  options,
  selected,
  onChange,
  allLabel,
  searchable = true,
}: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    searchRef.current?.focus();

    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return options;
    return options.filter(
      (o) => o.label.toLowerCase().includes(needle) || (o.hint ?? "").toLowerCase().includes(needle),
    );
  }, [options, query]);

  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const toggle = (value: string) => {
    onChange(
      selectedSet.has(value) ? selected.filter((v) => v !== value) : [...selected, value],
    );
  };

  const buttonLabel =
    selected.length === 0
      ? allLabel
      : selected.length === 1
        ? (options.find((o) => o.value === selected[0])?.label ?? "1 selected")
        : `${selected.length} selected`;

  return (
    <div ref={rootRef} className="relative min-w-0">
      <span className="label">{label}</span>

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={[
          "field flex w-full items-center justify-between gap-2 text-left",
          selected.length > 0 ? "border-brand/60" : "",
        ].join(" ")}
      >
        <span className={["truncate", selected.length === 0 ? "text-muted" : ""].join(" ")}>
          {buttonLabel}
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          {selected.length > 0 && (
            <span className="rounded bg-brand/20 px-1 font-mono text-[10px] text-brand tabular-nums">
              {selected.length}
            </span>
          )}
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden
            className={["text-muted transition-transform", open ? "rotate-180" : ""].join(" ")}
          >
            <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </span>
      </button>

      {open && (
        <div
          role="listbox"
          aria-multiselectable="true"
          aria-label={label}
          className="animate-rise absolute left-0 right-0 z-30 mt-1 overflow-hidden rounded-lg border border-line bg-surface shadow-2xl"
        >
          {searchable && (
            <div className="border-b border-line p-2">
              <input
                ref={searchRef}
                className="field !py-1 !text-xs"
                placeholder={`Search ${label.toLowerCase()}…`}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.stopPropagation()}
              />
            </div>
          )}

          <div className="flex items-center justify-between border-b border-line px-2.5 py-1.5">
            <button
              type="button"
              className="text-[11px] text-muted transition-colors hover:text-foreground"
              onClick={() => onChange(visible.map((o) => o.value))}
            >
              Select all{visible.length !== options.length ? ` (${visible.length})` : ""}
            </button>
            <button
              type="button"
              className="text-[11px] text-muted transition-colors hover:text-foreground"
              onClick={() => onChange([])}
              disabled={selected.length === 0}
            >
              Clear
            </button>
          </div>

          <ul className="max-h-64 overflow-y-auto py-1">
            {visible.length === 0 && (
              <li className="px-2.5 py-3 text-center text-[11px] text-muted">No matches</li>
            )}

            {visible.map((option) => {
              const checked = selectedSet.has(option.value);

              return (
                <li key={option.value}>
                  <label
                    className={[
                      "flex cursor-pointer items-start gap-2 px-2.5 py-1.5 transition-colors hover:bg-surface-2",
                      checked ? "bg-brand/5" : "",
                    ].join(" ")}
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-[var(--brand)]"
                      checked={checked}
                      onChange={() => toggle(option.value)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs">{option.label}</span>
                      {option.hint && (
                        <span className="block truncate text-[10px] text-muted">{option.hint}</span>
                      )}
                    </span>
                    {option.count !== undefined && (
                      <span className="shrink-0 font-mono text-[10px] text-muted tabular-nums">
                        {option.count}
                      </span>
                    )}
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Read-only summary of the active filter chips, with per-chip removal. */
export function ActiveFilterChips({
  chips,
  onRemove,
  onClearAll,
}: {
  chips: { key: string; label: string }[];
  onRemove: (key: string) => void;
  onClearAll: () => void;
}) {
  if (chips.length === 0) {
    return (
      <p className="text-[11px] text-muted">
        No filters applied — showing the full reporting ledger.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          onClick={() => onRemove(chip.key)}
          className="chip !py-0.5 !text-[11px] !text-foreground transition-colors hover:border-brand/60"
          title="Remove this filter"
        >
          {chip.label}
          <span aria-hidden className="text-muted">
            ✕
          </span>
        </button>
      ))}
      <button
        type="button"
        onClick={onClearAll}
        className="text-[11px] text-muted underline underline-offset-2 transition-colors hover:text-foreground"
      >
        Clear all
      </button>
    </div>
  );
}
