import type { Metadata } from "next";

import EastSoundMasterModule from "@/components/east-sound-master";

export const metadata: Metadata = {
  title: "EastSound Compliance & Royalty Studio",
  description:
    "Automated Broadcast Monitoring & UPRS Regulatory Infrastructure for Uganda - Complete compliance, licensing, and royalty management system.",
};

export const dynamic = "force-dynamic";

export default function EastSoundPage() {
  return <EastSoundMasterModule />;
}
