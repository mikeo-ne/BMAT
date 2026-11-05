"use client";

// Independent-artist data. RLS limits queries to recordings this account owns.
import * as demo from "@/lib/data/artist";
import { safeArray } from "@/lib/safe";
import { db, must } from "./core";
import { SONG_COLUMNS, demoList, demoSeed, toSong, type Song } from "./masters";

export type Track = { id: string; title: string; year: number | null; isrc: string; spins30d: number; trend: number };
export type ArtistData = {
  stats: { tracks: number; spins30d: number; stations: number; estRoyaltyUgx: number };
  discography: Track[];
  leadTitle: string;
  velocity: number[];
  splits: { work: string; party: string; share: number }[];
  /** Songs this artist uploaded themself (editable here). */
  songs: Song[];
  /** Songs a label released for this artist (the label manages them). */
  labelSongs: number;
  userId: string | null;
};

export async function loadArtist(): Promise<ArtistData> {
  const sb = db();
  if (!sb) {
    demoSeed(demo.DISCOGRAPHY.map((t) => ({
      ...toSong({ id: t.id, title: t.title, artist_name: "Lamaro Grace", isrc: t.isrc, release_date: t.year ? `${t.year}-01-01` : null }),
      masterPath: `${t.id}/reference.wav`, enrolledAt: "2026-10-01T00:00:00Z",
    })));
    return {
      stats: demo.ARTIST_STATS, discography: demo.DISCOGRAPHY, leadTitle: demo.DISCOGRAPHY[0]?.title ?? "", velocity: demo.VELOCITY, splits: demo.SPLITS,
      songs: demoList(), labelSongs: 0, userId: null,
    };
  }
  const { data: who } = await sb.auth.getUser();
  const [recs, spins, splits, roy, mine] = await Promise.all([
    sb.from("recordings").select("id, title, isrc, release_date").order("release_date", { ascending: false }),
    sb.rpc("recording_spins", { p_days: 30 }),
    sb.from("split_shares").select("recording_id, party_name, share_pct").order("share_pct", { ascending: false }),
    sb.from("royalty_statements").select("amount_ugx, status").eq("status", "estimated"),
    sb.from("recordings").select(`${SONG_COLUMNS}, label_org_id`).order("created_at", { ascending: false }),
  ]);
  const own = safeArray(must(mine, "songs") as (Parameters<typeof toSong>[0] & { label_org_id: string | null })[]);
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
    songs: own.filter((r) => !r.label_org_id).map(toSong),
    labelSongs: own.filter((r) => r.label_org_id).length,
    userId: who.user?.id ?? null,
    splits: safeArray(must(splits, "splits") as { recording_id: string; party_name: string; share_pct: number }[]).map((x) => ({
      work: title.get(x.recording_id) ?? "—", party: x.party_name, share: Number(x.share_pct),
    })),
  };
}
