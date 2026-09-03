import type { Metadata } from "next";

import { MixParserView } from "@/components/mix-parser-view";
import { readTracks } from "@/lib/store";

export const metadata: Metadata = {
  title: "Unidentified Audio & DJ Mix Parser",
  description:
    "Parse an hour of continuous station audio into segments, review auto-detected track transitions, and manually tag unidentified clips against the metadata catalogue.",
};

export const dynamic = "force-dynamic";

export default async function MixParserPage() {
  const catalogue = await readTracks();

  return <MixParserView catalogue={catalogue} />;
}
