import { masterDeliveryMode } from "@/lib/master-storage-config";
import { ArtistPortal } from "@/components/artist-portal";
import { PANEL_SIZE } from "@/lib/catalog";
import {
  capturePollingAvailable,
  masterUploadsAvailable,
} from "@/lib/runtime-storage";
import { readPageWorkspace } from "@/lib/workspace-data";
import type { ArtistView } from "@/lib/workspaces";

/** One data path for overview, research, catalogue and delivery; never a second demo catalogue. */
export async function ArtistWorkspace({
  initialView = "overview",
}: {
  initialView?: ArtistView;
}) {
  const data = await readPageWorkspace(
    ["artist", "label", "cmo"],
    {
      overview: "/dashboard/artist",
      music: "/dashboard/artists",
      catalogue: "/dashboard/artist/catalogue",
      delivery: "/dashboard/artist/delivery",
    }[initialView],
  );
  return (
    <ArtistPortal
      initialTracks={data.catalogue}
      panelSize={PANEL_SIZE}
      initialView={initialView}
      initialEvents={data.history}
      now={data.now}
      canPoll={capturePollingAvailable()}
      deliveryAvailable={masterUploadsAvailable() && !data.actor.mock}
      cloudDelivery={masterDeliveryMode() === "direct-blob"}
    />
  );
}
