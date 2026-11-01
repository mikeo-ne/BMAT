import "server-only";
import { readTracks } from "@/lib/store";
import { readCapturedSpins } from "@/lib/broadcast-store";
import {
  catalogueWithCapturedStats,
  currentCapturedWindow,
} from "@/lib/captured-airplay";

export async function readWorkspaceData(now = new Date()) {
  const [tracks, history] = await Promise.all([
    readTracks(),
    readCapturedSpins(),
  ]);
  return {
    catalogue: catalogueWithCapturedStats(tracks, history, now),
    events: currentCapturedWindow(history, now),
    history,
    now: now.toISOString(),
  };
}
export async function readAnalyticsTracks() {
  return (await readWorkspaceData()).catalogue;
}
