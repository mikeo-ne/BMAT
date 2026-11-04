"use client";

// Record-label data. RLS limits every query to the caller's own organisation.
import * as demo from "@/lib/data/label";
import { safeArray } from "@/lib/safe";
import { db, must } from "./core";

export type RosterArtist = { id: string; name: string; genre: string; tracks: number; spins30d: number };
export type CatalogueItem = { id: string; title: string; artist: string; isrc: string; upc: string; release: string; fingerprinted: boolean };
export type LabelData = {
  orgId: string | null;
  stats: { artists: number; recordings: number; spins30d: number; revenueYtd: number };
  roster: RosterArtist[];
  catalogue: CatalogueItem[];
  revenue: { month: string; ugx: number; status: string }[];
};

// Demo mode keeps edits in memory for the session so the dashboard behaves like the real thing.
let demoRoster: RosterArtist[] | null = null;
let demoCatalogue: CatalogueItem[] | null = null;
const demoStore = () => {
  demoRoster ??= demo.ROSTER.map(({ whatsapp: _w, ...a }) => a);
  demoCatalogue ??= demo.CATALOGUE.map((c) => ({ ...c }));
  return { roster: demoRoster, catalogue: demoCatalogue };
};

export async function loadLabel(): Promise<LabelData> {
  const sb = db();
  if (!sb) {
    const st = demoStore();
    return {
      orgId: null,
      stats: { ...demo.LABEL_STATS, artists: st.roster.length },
      roster: [...st.roster],
      catalogue: st.catalogue.map((c) => ({ ...c })),
      revenue: demo.LABEL_REVENUE.map((r) => ({ ...r, status: r.month.endsWith("*") ? "estimated" : "paid" })),
    };
  }
  const { data: u } = await sb.auth.getUser();
  const prof = must(await sb.from("profiles").select("org_id").eq("id", u.user?.id ?? "").maybeSingle(), "profile") as { org_id: string | null } | null;
  const [artists, recs, spins, roy] = await Promise.all([
    sb.from("artists").select("id, name, genre").order("name"),
    sb.from("recordings").select("id, title, artist_name, artist_id, isrc, upc, release_date, fingerprint").order("release_date", { ascending: false }),
    sb.rpc("recording_spins", { p_days: 30 }),
    sb.from("royalty_statements").select("period, amount_ugx, status").order("period").limit(12),
  ]);
  const recRows = safeArray(must(recs, "catalogue") as { id: string; title: string; artist_name: string | null; artist_id: string | null; isrc: string | null; upc: string | null; release_date: string | null; fingerprint: string | null }[]);
  const spinBy = new Map(safeArray(must(spins, "spins") as { recording_id: string; spins: number }[]).map((s) => [s.recording_id, Number(s.spins)]));
  const roster = safeArray(must(artists, "roster") as { id: string; name: string; genre: string | null }[]).map((a) => {
    const mine = recRows.filter((r) => r.artist_id === a.id);
    return { id: a.id, name: a.name, genre: a.genre ?? "—", tracks: mine.length, spins30d: mine.reduce((s, r) => s + (spinBy.get(r.id) ?? 0), 0) };
  });
  const year = String(new Date().getFullYear());
  const revenue = safeArray(must(roy, "royalties") as { period: string; amount_ugx: number; status: string }[]).map((r) => ({
    month: new Date(r.period + "T00:00:00").toLocaleString("en-GB", { month: "short" }) + (r.status === "estimated" ? "*" : ""),
    ugx: Number(r.amount_ugx),
    status: r.status,
    period: r.period,
  }));
  return {
    orgId: prof?.org_id ?? null,
    stats: {
      artists: roster.length,
      recordings: recRows.length,
      spins30d: recRows.reduce((s, r) => s + (spinBy.get(r.id) ?? 0), 0),
      revenueYtd: revenue.filter((r) => r.period.startsWith(year)).reduce((s, r) => s + r.ugx, 0),
    },
    roster,
    catalogue: recRows.map((r) => ({
      id: r.id, title: r.title, artist: r.artist_name ?? "—", isrc: r.isrc ?? "", upc: r.upc ?? "",
      release: r.release_date ?? "", fingerprinted: Boolean(r.fingerprint),
    })),
    revenue: revenue.map(({ period: _p, ...r }) => r),
  };
}

export async function addArtist(orgId: string | null, name: string, genre: string): Promise<void> {
  const sb = db();
  if (!sb) {
    demoStore().roster.push({ id: `demo-${Date.now()}`, name, genre, tracks: 0, spins30d: 0 });
    return;
  }
  if (!orgId) throw new Error("Your account isn't linked to a label yet.");
  must(await sb.from("artists").insert({ label_org_id: orgId, name, genre }).select("id"), "add artist");
}

export async function removeArtist(id: string): Promise<void> {
  const sb = db();
  if (!sb) {
    demoRoster = demoStore().roster.filter((a) => a.id !== id);
    return;
  }
  must(await sb.from("artists").delete().eq("id", id).select("id"), "remove artist");
}

export async function saveCodes(id: string, isrc: string, upc: string): Promise<void> {
  const sb = db();
  if (!sb) {
    const c = demoStore().catalogue.find((x) => x.id === id);
    if (c) Object.assign(c, { isrc, upc });
    return;
  }
  must(await sb.from("recordings").update({ isrc: isrc || null, upc: upc || null }).eq("id", id).select("id"), "save codes");
}

export async function saveFingerprint(id: string, hash: string): Promise<void> {
  const sb = db();
  if (!sb) {
    const c = demoStore().catalogue.find((x) => x.id === id);
    if (c) c.fingerprinted = Boolean(hash);
    return;
  }
  must(await sb.from("recordings").update({ fingerprint: hash }).eq("id", id).select("id"), "save fingerprint");
}
