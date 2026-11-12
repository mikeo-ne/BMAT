"use client";

// Per-song airplay report keyed by ISRC/UPC, and the pitch text built from it.
// Artists hand these to distributors, DSP editors and press: there is no way to
// push airplay into a DSP directly, so the report is shaped for people to use.
import { safeArray } from "@/lib/safe";
import { db, must } from "./core";

export type SongAirplay = {
  id: string; title: string; artist: string; featuring: string | null; isrc: string | null; upc: string | null;
  plays: number; stations: number; first_play: string | null; last_play: string | null;
  regions: string[]; top_stations: { name: string; plays: number }[]; proof_token: string | null;
};
export type SongReport = { days: number; songs: SongAirplay[]; demo: boolean };

export function parseReport(raw: Record<string, unknown> | null, demo = false): SongReport {
  const r = raw ?? {};
  return {
    days: Number(r.days) || 30,
    songs: safeArray<SongAirplay>(r.songs as SongAirplay[]).map((s) => ({
      ...s,
      plays: Number(s.plays) || 0,
      stations: Number(s.stations) || 0,
      regions: safeArray<string>(s.regions).filter(Boolean),
      top_stations: safeArray<{ name: string; plays: number }>(s.top_stations).map((t) => ({ name: t.name, plays: Number(t.plays) || 0 })),
    })),
    demo,
  };
}

export async function loadSongReport(days = 30): Promise<SongReport> {
  const sb = db();
  if (!sb) return demoReport(days);
  return parseReport(must(await sb.rpc("song_airplay_report", { p_days: days }), "airplay report") as Record<string, unknown>);
}

const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

/** One paragraph for a DSP playlist pitch, a press release or an EPK. Null when there is nothing to say yet. */
export function pitchText(s: SongAirplay, days: number, proofUrl?: string): string | null {
  if (s.plays <= 0) return null;
  const who = s.featuring ? `${s.artist} ft. ${s.featuring}` : s.artist;
  const times = s.plays === 1 ? "once" : `${s.plays} times`;
  const where = s.stations === 1 ? "1 Ugandan radio station" : `${s.stations} Ugandan radio stations`;
  const top = s.top_stations.slice(0, 3).map((t) => t.name);
  const parts = [
    `"${s.title}" by ${who} has played ${times} on ${where} in the last ${days} days`,
    top.length ? `, with most spins on ${list(top)}` : "",
    s.regions.length > 1 ? ` across ${list(s.regions)} Uganda` : s.regions.length === 1 ? ` in ${s.regions[0]} Uganda` : "",
    ".",
  ];
  let text = parts.join("");
  if (s.isrc) text += ` ISRC ${s.isrc}.`;
  text += " Airplay verified by East Sound Technologies.";
  if (proofUrl) text += ` Hear it on air: ${proofUrl}`;
  return text;
}

export const REPORT_HEADERS = ["Title", "Artist", "Featuring", "ISRC", "UPC", "Plays", "Stations", "Regions", "Top stations", "First play", "Last play", "Period (days)"];

export function reportRows(r: SongReport): (string | number)[][] {
  return r.songs.map((s) => [
    s.title, s.artist, s.featuring ?? "", s.isrc ?? "", s.upc ?? "", s.plays, s.stations,
    s.regions.join("; "), s.top_stations.map((t) => `${t.name} (${t.plays})`).join("; "),
    s.first_play ?? "", s.last_play ?? "", r.days,
  ]);
}

function demoReport(days: number): SongReport {
  return parseReport({
    days,
    songs: [
      { id: "d1", title: "Kampala Nights", artist: "Lamaro Grace", featuring: null, isrc: "UG-A1B-26-00012", upc: "196000000017",
        plays: 31, stations: 7, first_play: "2026-10-15T08:12:00Z", last_play: "2026-11-11T16:42:00Z", regions: ["Central", "Eastern", "Western"],
        top_stations: [{ name: "Capital FM", plays: 11 }, { name: "Galaxy FM", plays: 9 }, { name: "NBS Radio (Next Radio)", plays: 7 }], proof_token: "d3e0c1a5b7f94e2a8c6d0b1f2e3a4c5d" },
      { id: "d2", title: "Omukwano", artist: "Lamaro Grace", featuring: "Kato Brian", isrc: "UG-A1B-26-00019", upc: "196000000024",
        plays: 16, stations: 4, first_play: "2026-10-20T19:05:00Z", last_play: "2026-11-10T05:30:00Z", regions: ["Eastern", "Western"],
        top_stations: [{ name: "Busoga One FM", plays: 6 }, { name: "Crooze FM", plays: 4 }, { name: "Radio Simba", plays: 3 }], proof_token: null },
      { id: "d3", title: "Rwenzori Rain", artist: "Lamaro Grace", featuring: null, isrc: "UG-IND-25-00377", upc: null,
        plays: 0, stations: 0, first_play: null, last_play: null, regions: [], top_stations: [], proof_token: null },
    ],
  }, true);
}
