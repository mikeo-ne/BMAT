import type { Metadata } from "next";
import { ArtistWorkspace } from "@/components/artist-workspace";

export const metadata: Metadata = {
  title: "Master Delivery",
  description:
    "Stage an authorized WAV or MP3 up to 80 MiB, retain verified ISRCs and agree collaborator shares. Server delivery requires supported durable storage.",
};
export const dynamic = "force-dynamic";
export default function DeliveryPage() {
  return <ArtistWorkspace initialView="delivery" />;
}
