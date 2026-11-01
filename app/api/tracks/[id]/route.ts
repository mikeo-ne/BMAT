import { guardedApi } from "@/lib/auth-core";
import {
  masterUploadsAvailable,
  MASTER_STORAGE_NOTICE,
} from "@/lib/runtime-storage";
import { NextResponse } from "next/server";

import { deleteTrack, readTracks } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  request: Request,
  ctx: RouteContext<"/api/tracks/[id]">,
) {
  return guardedApi(request, ["artist"], true, async (actor) => {
    if (!masterUploadsAvailable())
      return NextResponse.json(
        { error: MASTER_STORAGE_NOTICE },
        { status: 503 },
      );
    const { id } = await ctx.params;
    const track = (await readTracks()).find(
      (row) => row.id === id && row.ownerId === actor.id,
    );
    if (!track)
      return NextResponse.json(
        { error: "No track with that id." },
        { status: 404 },
      );
    const result = await deleteTrack(id);

    if (!result.deleted) {
      return NextResponse.json(
        { error: "No track with that id." },
        { status: 404 },
      );
    }

    return NextResponse.json({
      deleted: true,
      id,
      remaining: (await readTracks()).filter((t) => t.ownerId === actor.id)
        .length,
    });
  });
}

export async function GET(
  request: Request,
  ctx: RouteContext<"/api/tracks/[id]">,
) {
  return guardedApi(request, ["artist"], false, async (actor) => {
    const { id } = await ctx.params;
    const track = (await readTracks()).find(
      (t) => t.id === id && t.ownerId === actor.id,
    );
    if (!track?.audio.storedName)
      return Response.json({ error: "Master not found." }, { status: 404 });
    const { readFile } = await import("node:fs/promises"),
      { default: path } = await import("node:path"),
      { UPLOAD_DIR } = await import("@/lib/store");
    const target = path.resolve(UPLOAD_DIR, track.audio.storedName);
    if (!target.startsWith(path.resolve(UPLOAD_DIR) + path.sep))
      return Response.json({ error: "Master not found." }, { status: 404 });
    let bytes: Buffer;
    try {
      bytes = await readFile(target);
    } catch {
      return Response.json(
        { error: "Master bytes are unavailable." },
        { status: 404 },
      );
    }
    const headers: Record<string, string> = {
      "content-type": track.audio.mimeType ?? "application/octet-stream",
      "accept-ranges": "bytes",
      "content-disposition":
        "inline; filename*=UTF-8''" + encodeURIComponent(track.audio.fileName),
    };
    const range = request.headers.get("range");
    if (!range) {
      headers["content-length"] = String(bytes.length);
      return new Response(new Uint8Array(bytes), { headers });
    }
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match || (!match[1] && !match[2]))
      return new Response(null, {
        status: 416,
        headers: { ...headers, "content-range": `bytes */${bytes.length}` },
      });
    const suffix = !match[1],
      start = suffix
        ? Math.max(0, bytes.length - Number(match[2]))
        : Number(match[1]),
      end = suffix
        ? bytes.length - 1
        : Math.min(
            bytes.length - 1,
            match[2] ? Number(match[2]) : bytes.length - 1,
          );
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start < 0 ||
      start >= bytes.length ||
      end < start
    )
      return new Response(null, {
        status: 416,
        headers: { ...headers, "content-range": `bytes */${bytes.length}` },
      });
    return new Response(new Uint8Array(bytes.subarray(start, end + 1)), {
      status: 206,
      headers: {
        ...headers,
        "content-length": String(end - start + 1),
        "content-range": `bytes ${start}-${end}/${bytes.length}`,
      },
    });
  });
}
