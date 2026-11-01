import {
  integrationAuth,
  readBoundedJson,
  RequestBodyError,
} from "@/lib/integration-auth";
import { parseNotificationPreferences } from "@/lib/notifications";
import { readTracks } from "@/lib/store";
import {
  postgresPool,
  postgresStorageEnabled,
  postgresTenant,
  requiredUuid,
} from "@/lib/postgres/pool";
import {
  syncPostgresRules,
  RuleConfigurationError,
} from "@/lib/postgres/rules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function authorize(request: Request): Response | null {
  const denied = integrationAuth(request, "EAST_SOUND_NOTIFICATION_TOKEN");
  if (denied) return denied;
  if (!postgresStorageEnabled())
    return Response.json(
      {
        error:
          "Persistent rules require explicit PostgreSQL storage configuration.",
      },
      { status: 503 },
    );
  return null;
}
/** Private integration API. Never authorizes from browser role selection or body-supplied user/tenant IDs. */
export async function POST(request: Request) {
  try {
    const denied = authorize(request);
    if (denied) return denied;
    const body = await readBoundedJson(request, 128 * 1024);
    const raw =
      body && typeof body === "object" && "config" in body
        ? (body as { config: unknown }).config
        : body;
    const config = parseNotificationPreferences(raw);
    if (!config)
      return Response.json(
        { error: "Send a valid, consented notification configuration." },
        { status: 422 },
      );
    const result = await syncPostgresRules(
      config,
      requiredUuid("EAST_SOUND_NOTIFICATION_USER_ID"),
      await readTracks(),
    );
    return Response.json({
      ...result,
      notice:
        "Persisted watch rules are scoped to this server's configured principal and tenant. Unchanged configurations are idempotent; changed configurations start a new activation window. No messages were sent.",
    });
  } catch (error) {
    if (error instanceof RuleConfigurationError)
      return Response.json({ error: error.message }, { status: 422 });
    if (error instanceof RequestBodyError)
      return Response.json({ error: error.message }, { status: error.status });
    return Response.json(
      {
        error:
          "The rule configuration could not be committed. No fallback/reset or successful subscription activation is assumed.",
      },
      { status: 503 },
    );
  }
}
export async function GET(request: Request) {
  try {
    const denied = authorize(request);
    if (denied) return denied;
    const counts = await postgresPool().query<{
      status: string;
      count: string;
    }>(
      "SELECT status,count(*)::text AS count FROM east_sound.notification_outbox WHERE tenant_id=$1 GROUP BY status",
      [postgresTenant()],
    );
    return Response.json({
      backend: "postgres",
      outbox: Object.fromEntries(
        counts.rows.map((row) => [row.status, row.count]),
      ),
      notice:
        "sent means provider-accepted only. Recipient addresses and payloads are not returned.",
    });
  } catch {
    return Response.json(
      { error: "PostgreSQL status unavailable." },
      { status: 503 },
    );
  }
}
