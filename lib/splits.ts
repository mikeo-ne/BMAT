// ReSol split-sheet arithmetic, lifted out of the CMO dashboard's calculator
// so the money maths can be tested without rendering inputs.

import { safeArray, safeNumber } from "@/lib/safe";

export type SplitRow = {
  id: number | string;
  party: string;
  role: string;
  share: string | number;
};

export type SplitBalance = {
  total: number;
  balanced: boolean;
  delta: number;
  tone: "ok" | "bad";
  label: string;
};

/** Tolerates float noise like 33.33 + 33.33 + 33.34. */
const TOLERANCE = 0.001;

/**
 * Keeps digits and at most one decimal point while the user types.
 * A second dot is dropped rather than silently turning the field into NaN.
 */
export function sanitizeShare(raw: unknown): string {
  const text = typeof raw === "string" ? raw : String(raw ?? "");
  const digits = text.replace(/[^\d.]/g, "");
  const firstDot = digits.indexOf(".");
  if (firstDot === -1) return digits;
  return digits.slice(0, firstDot + 1) + digits.slice(firstDot + 1).replace(/\./g, "");
}

export function splitTotal(rows: readonly SplitRow[] | null | undefined): number {
  return safeArray(rows).reduce((sum, row) => sum + safeNumber(row?.share), 0);
}

/** Balances the sheet against 100%, and says which way it is off. */
export function splitBalance(total: number): SplitBalance {
  const value = safeNumber(total);
  const delta = value - 100;
  const balanced = Math.abs(delta) < TOLERANCE;
  if (balanced) return { total: value, balanced, delta: 0, tone: "ok", label: "Adds up to 100%" };
  return {
    total: value,
    balanced,
    delta,
    tone: "bad",
    label: delta > 0 ? `Over by ${delta.toFixed(2)}%` : `${Math.abs(delta).toFixed(2)}% unassigned`,
  };
}

/** What one party earns from a pool of `pool` at `share` percent. */
export function partyAmount(pool: number | string, share: number | string): number {
  const amount = safeNumber(pool);
  const pct = safeNumber(share);
  if (amount <= 0 || pct <= 0) return 0;
  return (amount * pct) / 100;
}

export type Allocation = {
  id: number | string;
  party: string;
  role: string;
  share: number;
  amount: number;
};

/**
 * Per-party payout for the whole sheet. Amounts are rounded to whole UGX;
 * negative pools clamp to zero rather than paying a negative royalty.
 */
export function allocatePool(
  pool: number | string,
  rows: readonly SplitRow[] | null | undefined,
): Allocation[] {
  return safeArray(rows).map((row) => {
    const share = safeNumber(row?.share);
    return {
      id: row.id,
      party: row.party,
      role: row.role,
      share,
      amount: Math.round(partyAmount(pool, share)),
    };
  });
}

export type SplitValidation = { ok: boolean; errors: string[] };

/** Blocking problems an operator must fix before a sheet can be filed. */
export function validateSplits(
  rows: readonly SplitRow[] | null | undefined,
): SplitValidation {
  const list = safeArray(rows);
  const errors: string[] = [];

  if (list.length === 0) errors.push("Add at least one party.");
  if (list.length > 0) {
    for (const [i, row] of list.entries()) {
      const share = safeNumber(row?.share);
      const name = (row?.party ?? "").trim();
      if (!name) errors.push(`Party ${i + 1} needs a name.`);
      if (share < 0) errors.push(`${name || `Party ${i + 1}`} has a negative share.`);
      if (share > 100) errors.push(`${name || `Party ${i + 1}`} is over 100%.`);
    }
    const balance = splitBalance(splitTotal(list));
    if (!balance.balanced) errors.push(balance.label);
  }

  return { ok: errors.length === 0, errors };
}
