import { CmoRightsReview } from "@/components/cmo-rights-review";
import { Suspense } from "react";
import { AuthenticatedSplitInbox } from "@/components/authenticated-splits";
import type { Metadata } from "next";

import { SplitManager } from "@/components/split-manager";
import { buildDisputes, buildSplitSheets } from "@/lib/splits";
import { readPageWorkspace } from "@/lib/workspace-data";

export const metadata: Metadata = {
  title: "Rights & Split-Sheet Management",
  description:
    "Ownership percentages per recording, collaboration sign-off status, and the CMO dispute queue for overlapping ISRC registrations.",
};

export const dynamic = "force-dynamic";

export default async function SplitsPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string }>;
}) {
  const query = await searchParams;
  const target =
    query.invite && /^[a-f0-9]{64}$/.test(query.invite)
      ? "/dashboard/splits?invite=" + query.invite
      : "/dashboard/splits";
  const { catalogue, actor } = await readPageWorkspace(
    ["artist", "cmo"],
    target,
  );
  const sheets = buildSplitSheets(catalogue);
  const disputes = buildDisputes(sheets);

  return (
    <>
      {actor.role === "artist" ? (
        <Suspense fallback={<p>Loading agreements…</p>}>
          <AuthenticatedSplitInbox />
        </Suspense>
      ) : (
        <CmoRightsReview
          recordings={catalogue.map(({ id, title, primaryArtist, isrc }) => ({
            id,
            title,
            primaryArtist,
            isrc,
          }))}
        />
      )}
      <SplitManager sheets={sheets} disputes={disputes} />
    </>
  );
}
