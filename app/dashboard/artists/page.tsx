import {
  capturePollingAvailable,
  masterUploadsAvailable,
} from "@/lib/runtime-storage";
import type { Metadata } from "next";
import { ArtistPortal } from "@/components/artist-portal";
import { PANEL_SIZE } from "@/lib/catalog";
import { readWorkspaceData } from "@/lib/workspace-data";

export const metadata: Metadata = {
  title: "Artists & Music — BARANGA, MR FALLBACK, SOUNDLYKBB & TAI DAI",
  description:
    "Sourced artist profiles, release metadata and original-platform listening for Baranga, Mr fallback, Soundlykbb and Tai Dai. Public references, not simulated airplay or a master licence.",
};
export const dynamic = "force-dynamic";

export default async function ArtistsPage() {
  const data = await readWorkspaceData();
  return (
    <ArtistPortal
      initialTracks={data.catalogue}
      panelSize={PANEL_SIZE}
      initialView="music"
      initialEvents={data.history}
      now={data.now}
      canPoll={capturePollingAvailable()}
      deliveryAvailable={masterUploadsAvailable()}
    />
  );
}
