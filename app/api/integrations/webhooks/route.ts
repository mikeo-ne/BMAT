import { guardedApi, HttpError } from "@/lib/auth-core";
import { readBoundedJson } from "@/lib/integration-auth";
import { notificationExecutionReadiness } from "@/lib/notification-runtime";
import {
  createWebhookReceiver,
  changeWebhookReceiver,
  listWebhookReceivers,
  receiverOrigin,
  testWebhookReceiver,
  webhookStorageStatus,
} from "@/lib/webhook-inbox";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return guardedApi(request, ["artist"], false, async (actor) => {
    const storage = await webhookStorageStatus();
    return Response.json({
      execution: notificationExecutionReadiness(),
      storage,
      origin: receiverOrigin(),
      encryptionKeyConfigured:
        !!process.env.EAST_SOUND_SECRET_KEY ||
        process.env.EAST_SOUND_STORAGE_BACKEND !== "postgres",
      receivers:
        storage.available && !actor.mock
          ? await listWebhookReceivers(actor)
          : [],
      emailSenderMode: !process.env.EAST_SOUND_EMAIL_FROM
        ? "unconfigured"
        : process.env.EAST_SOUND_EMAIL_FROM.toLowerCase().endsWith(
              "@resend.dev",
            )
          ? "restricted-test"
          : "custom-domain",
      mockIdentity: actor.mock,
    });
  });
}
export async function POST(request: Request) {
  return guardedApi(request, ["artist"], true, async (actor) => {
    const raw = await readBoundedJson(request, 4096);
    if (!raw || typeof raw !== "object" || Array.isArray(raw))
      throw new HttpError(422, "Invalid receiver action.");
    const input = raw as Record<string, unknown>,
      id = typeof input.id === "string" ? input.id : "";
    if (input.action === "create")
      return Response.json(await createWebhookReceiver(actor, input.label), {
        status: 201,
      });
    if (input.action === "test")
      return Response.json(await testWebhookReceiver(actor, id));
    if (
      input.action === "rotate" ||
      input.action === "enable" ||
      input.action === "disable"
    )
      return Response.json(
        await changeWebhookReceiver(actor, id, input.action),
      );
    throw new HttpError(422, "Choose create, rotate, enable, disable or test.");
  });
}
