import type { Metadata } from "next";
import { ArtistWorkspace } from "@/components/artist-workspace";

export const metadata: Metadata = {
  title: "Artist & Label Portal",
  description:
    "Deliver MP3/WAV masters with metadata and an ISRC, then track spins across the Uganda FM panel by region.",
};

export const dynamic = "force-dynamic";

export default function ArtistPage() {
  return <ArtistWorkspace initialView="overview" />;
}
