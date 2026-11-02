import { guardedApi, HttpError } from "@/lib/auth-core";
import { readBoundedJson } from "@/lib/integration-auth";
import { prepareMasterUpload } from "@/lib/cloud-masters";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
/** Metadata only: audio bytes go directly from the browser to a verified private object store. */
export async function POST(request: Request) {
  return guardedApi(request, ["artist"], true, async (actor) => {
    if (!request.headers.get("content-type")?.startsWith("application/json"))
      throw new HttpError(415, "Use application/json for the upload metadata.");
    const input = await readBoundedJson(request, 64 * 1024);
    if (!input || typeof input !== "object" || Array.isArray(input))
      throw new HttpError(422, "Invalid upload metadata.");
    return Response.json(
      await prepareMasterUpload(actor, input as Record<string, unknown>),
      { status: 200 },
    );
  });
}
