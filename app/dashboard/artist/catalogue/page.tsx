import type { Metadata } from "next";
import { ArtistWorkspace } from "@/components/artist-workspace";

export const metadata: Metadata = {
  title: "My Catalogue & ISRC",
  description:
    "Real sourced references and authorized delivered recordings. Unknown identifiers and ownership remain unknown.",
};
export const dynamic = "force-dynamic";
export default function CataloguePage() {
  return <ArtistWorkspace initialView="catalogue" />;
}
