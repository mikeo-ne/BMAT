// Shared types + pure helpers for brand mentions (no data access here —
// each role fetches through its own lib/db module, so isolation holds).

export type MentionStatus = "unreviewed" | "confirmed" | "rejected";

export type Mention = {
  id: string;
  station: string;
  brand: string;
  heard: string; // the words that matched
  transcript: string;
  heardAt: string; // ISO
  score: number;
  status: MentionStatus;
  evidencePath: string | null;
};

export type TrackedBrand = { id: string; brand: string; terms: string[]; aliases: string[]; active: boolean };

/** Plays per brand, most mentioned first. Rejected mentions are not counted. */
export function mentionCounts(list: Mention[] | null | undefined): { brand: string; count: number }[] {
  const by = new Map<string, number>();
  for (const m of list ?? []) if (m.status !== "rejected") by.set(m.brand, (by.get(m.brand) ?? 0) + 1);
  return [...by.entries()].map(([brand, count]) => ({ brand, count })).sort((a, b) => b.count - a.count || a.brand.localeCompare(b.brand));
}

/** Split a comma/line separated list of spoken forms into clean, lowercase, unique terms. */
export function parseTerms(input: string): string[] {
  const out: string[] = [];
  for (const raw of input.split(/[,\n|]/)) {
    const t = raw.toLowerCase().replace(/[^a-z0-9 '\-.]/g, " ").replace(/\s+/g, " ").trim();
    if (t && t.length <= 60 && !out.includes(t)) out.push(t);
  }
  return out.slice(0, 20);
}

/** A confirmed mention whose words differ from every known form is worth learning as a "heard as" alias. */
export function aliasToLearn(m: Pick<Mention, "heard" | "brand">, brand: TrackedBrand | undefined): string | null {
  if (!brand) return null;
  const heard = m.heard.toLowerCase().trim();
  if (heard.replace(/\s/g, "").length < 5) return null; // too short to be a safe alias
  const known = [...brand.terms, ...brand.aliases].map((t) => t.toLowerCase().trim());
  return known.includes(heard) ? null : heard;
}
