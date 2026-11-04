import "server-only";
import type { SessionUser } from "@/lib/auth-types";
import type { Track } from "@/lib/types";
import type { BroadcastSpin } from "@/lib/playout";

export function ownsTrack(user: SessionUser, track: Track): boolean {
  return (user.role === "artist" || user.role === "label") && track.ownerId === user.id;
}
export function allowedArtistTracks(
  user: SessionUser,
  tracks: Track[],
): Track[] {
  return tracks.filter((track) => ownsTrack(user, track));
}
export function clientTrack(track: Track): Track {
  const { blob: _object, ...audio } = track.audio;
  void _object;
  return { ...track, audio: { ...audio, storedName: null } };
}
function redactMaster(track: Track, rights = false): Track {
  const {
    ownerId: _owner,
    agreementId: _agreement,
    fingerprint: _fingerprint,
    ownership,
    ...rest
  } = track;
  void _owner;
  void _agreement;
  void _fingerprint;
  return {
    ...rest,
    audio: { ...clientTrack(track).audio, fileName: "", sizeBytes: 0 },
    ...(rights && ownership ? { ownership } : {}),
  };
}
/** Authorization happens before values cross a server/client or HTTP boundary. Browser state is not an input. */
export function isolateWorkspace(
  tracks: Track[],
  history: BroadcastSpin[],
  user: SessionUser | null,
): { tracks: Track[]; history: BroadcastSpin[] } {
  if (!user) {
    const visible = tracks.filter(
      (track) =>
        track.origin === "public-reference" || track.publicCharts === true,
    );
    const ids = new Set(visible.map((t) => t.id));
    return {
      tracks: visible.map((t) => redactMaster(t)),
      history: history
        .filter((e) => e.trackId !== null && ids.has(e.trackId))
        .map(({ evidence: _evidence, ...e }) => {
          void _evidence;
          return e;
        }),
    };
  }
  if (user.role === "artist" || user.role === "label") {
    const owned = allowedArtistTracks(user, tracks),
      ids = new Set(owned.map((t) => t.id));
    return {
      tracks: owned.map(clientTrack),
      history: history.filter((e) => e.trackId !== null && ids.has(e.trackId)),
    };
  }
  if (user.role === "broadcaster") {
    const selected = history.filter((e) =>
      user.stationIds.includes(e.stationId),
    );
    const ids = new Set(
      selected.flatMap((e) => (e.trackId ? [e.trackId] : [])),
    );
    return {
      tracks: tracks.filter((t) => ids.has(t.id)).map((t) => redactMaster(t)),
      history: selected,
    };
  }
  if (user.role === "venue") {
    // Venue operators only ever see their own ambient node activity. Station
    // playout and the wider catalogue never cross into a venue workspace.
    const assigned = new Set(user.stationIds);
    return {
      tracks: [],
      history: history.filter((e) => assigned.has(e.stationId)),
    };
  }
  return {
    tracks: tracks.map(clientTrack),
    history,
  };
}
