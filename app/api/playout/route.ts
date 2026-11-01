import { referenceStorageOnly } from "@/lib/runtime-storage";
import {
  integrationAuth,
  readBoundedJson,
  RequestBodyError,
} from "@/lib/integration-auth";
import { appendCapturedSpins, readCapturedSpins } from "@/lib/broadcast-store";
import { parseCapturedSpins } from "@/lib/captured-airplay";
import { readTracks } from "@/lib/store";
import { CaptureIdentityConflict } from "@/lib/postgres/captures";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    return Response.json({
      source: "captured-only",
      generatedAt: new Date().toISOString(),
      records: await readCapturedSpins(),
      notice:
        "No capture records are fabricated. Ingestion requires an authenticated broadcast/capture integration.",
    });
  } catch {
    return Response.json(
      { error: "The capture store is unavailable; no data has been replaced." },
      { status: 503 },
    );
  }
}
export async function POST(request: Request) {
  const denied = integrationAuth(request, "EAST_SOUND_INGEST_TOKEN");
  if (denied) return denied;
  if (referenceStorageOnly())
    return Response.json(
      {
        error:
          "Capture ingestion requires configured durable PostgreSQL on this cloud deployment. No records were saved.",
      },
      { status: 503 },
    );
  try {
    const body = await readBoundedJson(request, 256 * 1024);
    const parsed = parseCapturedSpins(body, await readTracks());
    if (parsed.errors.length)
      return Response.json(
        { error: "Capture validation failed.", errors: parsed.errors },
        { status: 422 },
      );
    return Response.json(await appendCapturedSpins(parsed.spins), {
      status: 201,
    });
  } catch (error) {
    if (error instanceof CaptureIdentityConflict)
      return Response.json({ error: error.message }, { status: 409 });
    if (error instanceof RequestBodyError)
      return Response.json({ error: error.message }, { status: error.status });
    return Response.json(
      {
        error:
          "The capture store is unavailable. No automatic reset was performed.",
      },
      { status: 503 },
    );
  }
}
