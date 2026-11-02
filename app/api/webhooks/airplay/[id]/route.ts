import { authError } from "@/lib/auth-core";
import { receiveWebhook } from "@/lib/webhook-inbox";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** HMAC-authenticated external ingress. Never creates a capture, sends a message or forwards the request. */
export async function POST(
  request: Request,
  context: RouteContext<"/api/webhooks/airplay/[id]">,
) {
  try {
    const { id } = await context.params;
    const result = await receiveWebhook(request, id);
    return Response.json(result, {
      status: result.duplicate ? 200 : 202,
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return authError(error);
  }
}
