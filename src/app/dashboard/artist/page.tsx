import type { Metadata } from "next";
import { ArtistPortal } from "@/components/artist-portal";

export const metadata: Metadata = {
  title: "Artist & Label Portal",
  description: "Deliver audio masters and track verified airplay across Uganda's FM regions.",
};

export default function ArtistPortalPage() {
  return <ArtistPortal />;
}
