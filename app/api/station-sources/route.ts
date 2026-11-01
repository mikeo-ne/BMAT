import { guardedApi, HttpError } from "@/lib/auth-core";
import { readBoundedJson } from "@/lib/integration-auth";
import {
  readAccountDocument,
  writeAccountDocument,
  audit,
} from "@/lib/security-store";
import { publicHttpsUrl } from "@/lib/public-url";
interface Source {
  stationId: string;
  url: string;
  format: "native" | "hls";
}
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return guardedApi(request, ["broadcaster"], false, async (actor) =>
    Response.json({
      sources: (
        (await readAccountDocument<Source[]>(actor.id, "station-sources")) ?? []
      ).filter((s) => actor.stationIds.includes(s.stationId)),
    }),
  );
}
export async function PUT(request: Request) {
  return guardedApi(request, ["broadcaster"], true, async (actor) => {
    const body = (await readBoundedJson(request, 65536)) as {
      sources?: Source[];
    };
    if (!body || !Array.isArray(body.sources) || body.sources.length > 33)
      throw new HttpError(422, "Send a bounded station-source list.");
    const ids = new Set<string>();
    for (const source of body.sources) {
      if (
        !source ||
        typeof source.stationId !== "string" ||
        !actor.stationIds.includes(source.stationId)
      )
        throw new HttpError(403, "Only assigned stations can be configured.");
      if (
        ids.has(source.stationId) ||
        typeof source.url !== "string" ||
        source.url.length > 2048 ||
        !publicHttpsUrl(source.url) ||
        !["native", "hls"].includes(source.format)
      )
        throw new HttpError(
          422,
          "Use one public HTTPS native/HLS source per assigned station.",
        );
      ids.add(source.stationId);
    }
    const sources = body.sources.map((s) => ({
      stationId: s.stationId,
      url: s.url.trim(),
      format: s.format,
    }));
    await writeAccountDocument(actor.id, "station-sources", sources);
    await audit(actor.id, "station.sources_saved", actor.id, {
      stationIds: sources.map((s) => s.stationId),
    });
    return Response.json({
      sources,
      notice:
        "Playback access is not a licensed recognition or capture connection.",
    });
  });
}
