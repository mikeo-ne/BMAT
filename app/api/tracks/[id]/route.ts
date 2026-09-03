import { NextResponse } from "next/server";

import { deleteTrack, readTracks } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(_request: Request, ctx: RouteContext<"/api/tracks/[id]">) {
  const { id } = await ctx.params;
  const result = await deleteTrack(id);

  if (!result.deleted) {
    return NextResponse.json({ error: "No track with that id." }, { status: 404 });
  }

  return NextResponse.json({ deleted: true, id, remaining: (await readTracks()).length });
}
