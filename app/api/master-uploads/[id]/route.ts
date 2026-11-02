import { guardedApi } from "@/lib/auth-core";
import { cancelMasterUpload, completeMasterUpload } from "@/lib/cloud-masters";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export async function POST(
  request: Request,
  context: RouteContext<"/api/master-uploads/[id]">,
) {
  return guardedApi(request, ["artist"], true, async (actor) => {
    const { id } = await context.params;
    const result = await completeMasterUpload(actor, id);
    return Response.json(result, { status: result.replayed ? 200 : 201 });
  });
}
export async function DELETE(
  request: Request,
  context: RouteContext<"/api/master-uploads/[id]">,
) {
  return guardedApi(request, ["artist"], true, async (actor) => {
    const { id } = await context.params;
    return Response.json(await cancelMasterUpload(actor, id));
  });
}
