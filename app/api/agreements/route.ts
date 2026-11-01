import { guardedApi, HttpError } from "@/lib/auth-core";
import { readBoundedJson } from "@/lib/integration-auth";
import {
  approveAgreement,
  cancelAgreement,
  createAgreement,
  agreementView,
  invitedAgreement,
  listOwnerAgreements,
  ownerAgreement,
} from "@/lib/release-agreements";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return guardedApi(request, ["artist"], false, async (actor) => {
    const query = new URL(request.url).searchParams,
      invite = query.get("invite"),
      id = query.get("id");
    if (invite) {
      const result = await invitedAgreement(actor, invite);
      return Response.json({
        agreement: agreementView(result.agreement, false),
        partyId: result.partyId,
      });
    }
    if (id)
      return Response.json({
        agreement: agreementView(await ownerAgreement(actor, id), true),
      });
    return Response.json({ agreements: await listOwnerAgreements(actor) });
  });
}
export async function POST(request: Request) {
  return guardedApi(request, ["artist"], true, async (actor) => {
    if (!request.headers.get("content-type")?.startsWith("application/json"))
      throw new HttpError(415, "Use application/json.");
    const raw = await readBoundedJson(request, 65536);
    if (!raw || typeof raw !== "object" || Array.isArray(raw))
      throw new HttpError(422, "Invalid agreement request.");
    const body = raw as Record<string, unknown>;
    if (body.action === "create")
      return Response.json(await createAgreement(actor, body), { status: 201 });
    if (body.action === "approve")
      return Response.json({ agreement: await approveAgreement(actor, body) });
    if (body.action === "cancel")
      return Response.json({
        agreement: await cancelAgreement(actor, String(body.id)),
      });
    throw new HttpError(422, "Choose an agreement action.");
  });
}
