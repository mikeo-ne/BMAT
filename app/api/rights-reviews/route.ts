import { guardedApi, HttpError } from "@/lib/auth-core";
import { readBoundedJson } from "@/lib/integration-auth";
import { listRightsReviews, recordRightsReview } from "@/lib/rights-reviews";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return guardedApi(request, ["cmo"], false, async () =>
    Response.json({ reviews: await listRightsReviews() }),
  );
}
export async function POST(request: Request) {
  return guardedApi(request, ["cmo"], true, async (actor) => {
    if (!request.headers.get("content-type")?.startsWith("application/json"))
      throw new HttpError(415, "Use application/json.");
    return Response.json(
      {
        review: await recordRightsReview(
          actor,
          await readBoundedJson(request, 16 * 1024),
        ),
      },
      { status: 201 },
    );
  });
}
