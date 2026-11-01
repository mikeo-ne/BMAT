import {
  capturePollingAvailable,
  masterUploadsAvailable,
} from "@/lib/runtime-storage";
import type { Metadata } from "next";

import { ArtistPortal } from "@/components/artist-portal";
import { PANEL_SIZE } from "@/lib/catalog";
import { readWorkspaceData } from "@/lib/workspace-data";

export const metadata: Metadata = {
  title: "Artist & Label Portal",
  description:
    "Deliver MP3/WAV masters with metadata and an ISRC, then track spins across the Uganda FM panel by region.",
};

export const dynamic = "force-dynamic";

export default async function ArtistPage() {
  const data = await readWorkspaceData();
  return (
    <ArtistPortal
      initialTracks={data.catalogue}
      panelSize={PANEL_SIZE}
      initialEvents={data.history}
      now={data.now}
      canPoll={capturePollingAvailable()}
      deliveryAvailable={masterUploadsAvailable()}
    />
  );
}
