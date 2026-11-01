import type { Metadata } from "next";
import { ArtistWorkspace } from "@/components/artist-workspace";

export const metadata: Metadata = {
  title: "Artists & Music — BARANGA, MR FALLBACK, SOUNDLYKBB & TAI DAI",
  description:
    "Sourced artist profiles, release metadata and original-platform listening for Baranga, Mr fallback, Soundlykbb and Tai Dai. Public references, not simulated airplay or a master licence.",
};
export const dynamic = "force-dynamic";

export default function ArtistPage() {
  return <ArtistWorkspace initialView="music" />;
}
