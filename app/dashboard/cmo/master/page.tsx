import type { Metadata } from "next";

import EastSoundMasterModule from "@/components/east-sound-master";

export const metadata: Metadata = {
  title: "EastSound Master - Compliance & Royalty Studio",
  description:
    "Comprehensive broadcast monitoring, licensing calculator, infringement radar, and royalty management system for Uganda's radio stations.",
};

export const dynamic = "force-dynamic";

export default function EastSoundMasterPage() {
  return <EastSoundMasterModule />;
}
