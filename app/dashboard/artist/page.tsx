import type { Metadata } from "next";

import { ArtistPortal } from "@/components/artist-portal";
import { PANEL_SIZE } from "@/lib/catalog";
import { readTracks } from "@/lib/store";

export const metadata: Metadata = {
  title: "Artist & Label Portal",
  description:
    "Deliver MP3/WAV masters with metadata and an ISRC, then track spins across the Uganda FM panel by region.",
};

export const dynamic = "force-dynamic";

export default async function ArtistPortalPage() {
  const tracks = await readTracks();

  return <ArtistPortal initialTracks={tracks} panelSize={PANEL_SIZE} />;
}
