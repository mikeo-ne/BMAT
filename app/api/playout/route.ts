import { dispatchAfterCaptureCommit } from "@/lib/notification-runtime";
import { guardedApi, HttpError } from "@/lib/auth-core";
import { readWorkspaceData } from "@/lib/workspace-data";
import { referenceStorageOnly } from "@/lib/runtime-storage";
import {
  integrationAuth,
  readBoundedJson,
  RequestBodyError,
} from "@/lib/integration-auth";
import { appendCapturedSpins } from "@/lib/broadcast-store";
import { parseCapturedSpins } from "@/lib/captured-airplay";
import { readTracks } from "@/lib/store";
import { CaptureIdentityConflict } from "@/lib/postgres/captures";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export async function GET(request?: Request) {
  return guardedApi(
    request,
    ["artist", "broadcaster", "cmo"],
    false,
    async (actor) => {
      const stationId = request
        ? new URL(request.url).searchParams.get("stationId")
        : null;
      if (
        actor.role === "broadcaster" &&
        stationId &&
        !actor.stationIds.includes(stationId)
      )
        throw new HttpError(
          403,
          "This station is not assigned to your account.",
        );
      const data = await readWorkspaceData(new Date(), actor);
      return Response.json({
        source: "captured-only",
        generatedAt: data.now,
        records: stationId
          ? data.history.filter((e) => e.stationId === stationId)
          : data.history,
        notice:
          "Server-scoped capture records only. Simulations never become verified broadcasts.",
      });
    },
  );
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
    const saved = await appendCapturedSpins(parsed.spins);
    dispatchAfterCaptureCommit();
    return Response.json(saved, { status: 201 });
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
