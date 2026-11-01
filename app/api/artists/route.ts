import { guardedApi } from "@/lib/auth-core";
import {
  MUSIC_RESEARCHED_ON,
  MUSIC_REFERENCE_NOTICE,
  MUSIC_SOURCES,
  PUBLIC_ARTISTS,
  REFERENCE_RECORDINGS,
} from "@/lib/artist-library";

/** Read-only research catalogue. Never writes to the delivered-master or royalty stores. */
function artistsResponse() {
  return Response.json({
    kind: "public-music-reference",
    researchedOn: MUSIC_RESEARCHED_ON,
    artists: PUBLIC_ARTISTS,
    recordings: REFERENCE_RECORDINGS,
    sources: MUSIC_SOURCES,
    usage: {
      playback: "original-platform-embed",
      masterAudioProvided: false,
      masterLicenceGranted: false,
      rightsSplitsVerified: false,
      airplay: "not-connected",
    },
    notice: MUSIC_REFERENCE_NOTICE,
  });
}

export async function GET(request?: Request) {
  return guardedApi(request, ["artist"], false, async () => artistsResponse());
}
