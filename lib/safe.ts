// Defensive helpers. Use these instead of touching raw data shapes directly.

/** Always returns an array — never null/undefined — so `.map` can't white-screen. */
export function safeArray<T>(value: readonly T[] | T[] | null | undefined): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

export function safeNumber(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function fmtInt(value: unknown): string {
  return Math.round(safeNumber(value)).toLocaleString("en-UG");
}

export function fmtUGX(value: unknown): string {
  return `UGX ${Math.round(safeNumber(value)).toLocaleString("en-UG")}`;
}

/** localStorage that never throws (private mode, SSR, quota). Call from useEffect/handlers only. */
export const safeStorage = {
  get<T>(key: string, fallback: T): T {
    if (typeof window === "undefined") return fallback;
    try {
      const raw = window.localStorage.getItem(key);
      return raw == null ? fallback : (JSON.parse(raw) as T);
    } catch {
      return fallback;
    }
  },
  set(key: string, value: unknown): void {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* ignore */
    }
  },
  remove(key: string): void {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};

/** Deterministic PRNG so seeded demo data is identical on server and client. */
export function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
