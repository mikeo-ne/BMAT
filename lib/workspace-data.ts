import "server-only";
import { readTracks } from "@/lib/store";
import { readCapturedSpins } from "@/lib/broadcast-store";
import {
  catalogueWithCapturedStats,
  currentCapturedWindow,
} from "@/lib/captured-airplay";
import { isolateWorkspace } from "@/lib/access-data";
import { requirePageRole } from "@/lib/auth";
import type { AccountRole, SessionUser } from "@/lib/auth-types";

/** Default scope is public, never an implicit privileged workspace. */
export async function readWorkspaceData(
  now = new Date(),
  user: SessionUser | null = null,
) {
  const [allTracks, allHistory] = await Promise.all([
    readTracks(),
    readCapturedSpins(),
  ]);
  const { tracks, history } = isolateWorkspace(allTracks, allHistory, user);
  return {
    catalogue: catalogueWithCapturedStats(tracks, history, now),
    events: currentCapturedWindow(history, now),
    history,
    now: now.toISOString(),
  };
}
export async function readPageWorkspace(roles: AccountRole[], path: string) {
  const actor = await requirePageRole(roles, path);
  return { ...(await readWorkspaceData(new Date(), actor)), actor };
}
export async function readAnalyticsTracks() {
  return (await readWorkspaceData()).catalogue;
}
