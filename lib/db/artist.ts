"use client";

// Independent-artist data. RLS limits queries to recordings this account owns.
import * as demo from "@/lib/data/artist";
import { safeArray } from "@/lib/safe";
import { db, must } from "./core";

export type Track = { id: string; title: string; year: number | null; isrc: string; spins30d: number; trend: number };
export type ArtistData = {
  stats: { tracks: number; spins30d: number; stations: number; estRoyaltyUgx: number };
  discography: Track[];
  leadTitle: string;
  velocity: number[];
  splits: { work: string; party: string; share: number }[];
};

export async function loadArtist(): Promise<ArtistData> {
  const sb = db();
  if (!sb) {
    return { stats: demo.ARTIST_STATS, discography: demo.DISCOGRAPHY, leadTitle: demo.DISCOGRAPHY[0]?.title ?? "", velocity: demo.VELOCITY, splits: demo.SPLITS };
  }
  const [recs, spins, splits, roy] = await Promise.all([
    sb.from("recordings").select("id, title, isrc, release_date").order("release_date", { ascending: false }),
    sb.rpc("recording_spins", { p_days: 30 }),
    sb.from("split_shares").select("recording_id, party_name, share_pct").order("share_pct", { ascending: false }),
    sb.from("royalty_statements").select("amount_ugx, status").eq("status", "estimated"),
  ]);
  const recRows = safeArray(must(recs, "discography") as { id: string; title: string; isrc: string | null; release_date: string | null }[]);
  const s = new Map(safeArray(must(spins, "spins") as { recording_id: string; spins: number; last_7: number; prev_7: number; stations: number }[]).map((x) => [x.recording_id, x]));
  const discography = recRows.map((r) => {
    const x = s.get(r.id);
    const last = Number(x?.last_7 ?? 0);
    const prev = Number(x?.prev_7 ?? 0);
    return {
      id: r.id, title: r.title, year: r.release_date ? Number(r.release_date.slice(0, 4)) : null, isrc: r.isrc ?? "",
      spins30d: Number(x?.spins ?? 0), trend: prev ? Math.round(((last - prev) / prev) * 100) : last ? 100 : 0,
    };
  }).sort((a, b) => b.spins30d - a.spins30d);

  const lead = discography[0];
  let velocity: number[] = [];
  if (lead) {
    const v = must(await sb.rpc("daily_spins", { p_recording: lead.id, p_days: 14 }), "velocity") as { spins: number }[];
    velocity = safeArray(v).map((d) => Number(d.spins));
  }
  const title = new Map(recRows.map((r) => [r.id, r.title]));
  return {
    stats: {
      tracks: recRows.length,
      spins30d: discography.reduce((a, t) => a + t.spins30d, 0),
      stations: Math.max(0, ...Array.from(s.values()).map((x) => Number(x.stations))),
      estRoyaltyUgx: safeArray(must(roy, "royalties") as { amount_ugx: number }[]).reduce((a, r) => a + Number(r.amount_ugx), 0),
    },
    discography,
    leadTitle: lead?.title ?? "",
    velocity,
    splits: safeArray(must(splits, "splits") as { recording_id: string; party_name: string; share_pct: number }[]).map((x) => ({
      work: title.get(x.recording_id) ?? "—", party: x.party_name, share: Number(x.share_pct),
    })),
  };
}
