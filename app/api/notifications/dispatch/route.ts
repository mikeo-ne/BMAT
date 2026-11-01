import { referenceStorageOnly } from "@/lib/runtime-storage";
import { createHash } from "node:crypto";
import { postgresStorageEnabled } from "@/lib/postgres/pool";
import { processPostgresOutbox } from "@/lib/postgres/outbox";
import {
  integrationAuth,
  readBoundedJson,
  RequestBodyError,
} from "@/lib/integration-auth";
import {
  parseNotificationPreferences,
  notificationCandidates,
  type WebhookDestination,
} from "@/lib/notifications";
import { readWorkspaceData } from "@/lib/workspace-data";
import {
  buildAirplayDigest,
  digestDue,
  type DigestKind,
} from "@/lib/notification-digests";
import { claimDelivery, finishDelivery } from "@/lib/notification-outbox";
import {
  notificationProviderReadiness,
  sendAlert,
  sendDigest,
  type TransportResult,
} from "@/lib/notification-transport";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const calls = new Map<string, number>();

/** Private worker endpoint. No provider secret is accepted from or exposed to the browser UI. */
export async function POST(request: Request) {
  const denied = integrationAuth(request, "EAST_SOUND_NOTIFICATION_TOKEN");
  if (denied) return denied;
  if (referenceStorageOnly())
    return Response.json(
      {
        error:
          "Dispatch requires durable PostgreSQL on this cloud deployment. No jobs were claimed and no messages sent.",
      },
      { status: 503 },
    );
  const readiness = notificationProviderReadiness();
  if (!readiness.liveEnabled)
    return Response.json(
      {
        error:
          "Live dispatch is disabled. Set EAST_SOUND_LIVE_NOTIFICATIONS=true only after configuring production integrations.",
      },
      { status: 503 },
    );
  // Bound HTTP invocations per Node process. PostgreSQL jobs additionally use shared row leases; file mode is single-process only.
  const key = createHash("sha256")
    .update(request.headers.get("authorization")!)
    .digest("hex");
  const now = new Date();
  if ((calls.get(key) ?? 0) > now.getTime() - 1000)
    return Response.json(
      { error: "Worker rate limit. Retry shortly." },
      { status: 429, headers: { "Retry-After": "1" } },
    );
  calls.set(key, now.getTime());
  try {
    const body = await readBoundedJson(request, 128 * 1024);
    if (!body || typeof body !== "object" || Array.isArray(body))
      return Response.json(
        { error: "Invalid worker request." },
        { status: 422 },
      );
    const input = body as {
      config?: unknown;
      action?: unknown;
      since?: unknown;
      force?: unknown;
    };
    if (postgresStorageEnabled() && input.action === "instant") {
      if (
        input.config !== undefined ||
        input.since !== undefined ||
        input.force !== undefined
      )
        return Response.json(
          {
            error:
              "PostgreSQL instant dispatch consumes committed outbox jobs. Register preferences through /api/notifications/rules; do not submit config, since or force here.",
          },
          { status: 422 },
        );
      return Response.json({
        ...(await processPostgresOutbox()),
        notice:
          "sent/provider-accepted does not mean delivered or read. Durable jobs use leases and bounded retries.",
      });
    }
    const config = parseNotificationPreferences(input.config);
    if (!config)
      return Response.json(
        { error: "A valid, opted-in notification configuration is required." },
        { status: 422 },
      );
    if (
      typeof input.action !== "string" ||
      !["instant", "daily", "weekly"].includes(input.action)
    )
      return Response.json(
        { error: "Action must be instant, daily or weekly." },
        { status: 422 },
      );
    const workspace = await readWorkspaceData(now);
    const jobs: {
      id: string;
      channel: "whatsapp" | "email" | "webhook";
      send: () => Promise<TransportResult>;
    }[] = [];
    if (input.action === "instant") {
      const since =
        input.since === undefined
          ? now.getTime() - 86400000
          : typeof input.since === "string"
            ? Date.parse(input.since)
            : NaN;
      if (
        !Number.isFinite(since) ||
        since < now.getTime() - 86400000 ||
        since > now.getTime()
      )
        return Response.json(
          { error: "since must be within the last 24 hours." },
          { status: 422 },
        );
      const events = notificationCandidates(
        workspace.history,
        workspace.catalogue,
        config,
        now,
      )
        .filter((event) => Date.parse(event.atIso) >= since)
        .reverse();
      for (const event of events) {
        const push = (hook?: WebhookDestination) =>
          jobs.push({
            id: hook ? `${event.id}:${encodeURIComponent(hook.id)}` : event.id,
            channel: event.channel,
            send: () => sendAlert(event, config, hook),
          });
        if (event.channel === "webhook")
          config.webhooks.filter((hook) => hook.enabled).forEach(push);
        else push();
      }
    } else {
      const kind = input.action as DigestKind;
      if (!readiness.email)
        return Response.json(
          { error: "Email provider is not configured." },
          { status: 503 },
        );
      if (!config.email.consent || !config.email.address)
        return Response.json(
          { error: "An opted-in email recipient is required." },
          { status: 422 },
        );
      if (input.force !== true && !digestDue(kind, config, now))
        return Response.json({
          skipped: true,
          reason: "not_due_in_EAT",
          accepted: 0,
        });
      const digest = buildAirplayDigest(
        workspace.history,
        workspace.catalogue,
        kind,
        now,
      );
      const recipient = createHash("sha256")
        .update(config.email.address.toLowerCase())
        .digest("hex")
        .slice(0, 24);
      const id = `digest:${kind}:${digest.endDay}:${recipient}`;
      jobs.push({
        id,
        channel: "email",
        send: () => sendDigest(digest, config, id),
      });
    }
    const claimed: ((typeof jobs)[number] & { attempts: number })[] = [];
    let skipped = 0;
    for (const job of jobs) {
      if (claimed.length >= 25) break;
      const claim = await claimDelivery(job.id, job.channel, now);
      if (claim) claimed.push({ ...job, attempts: claim.attempts });
      else skipped++;
    }
    let accepted = 0;
    let retry = 0;
    let failed = 0;
    for (let index = 0; index < claimed.length; index += 5) {
      await Promise.all(
        claimed.slice(index, index + 5).map(async (job) => {
          let result: TransportResult;
          try {
            result = await job.send();
          } catch {
            result = {
              accepted: false,
              retryable: true,
              code: "provider_unreachable",
            };
          }
          const status = await finishDelivery(job.id, result, job.attempts);
          if (status === "accepted") accepted++;
          else if (status === "retry") retry++;
          else if (status === "failed") failed++;
          else
            throw new Error("Delivery lease changed; outcome requires review.");
        }),
      );
    }
    return Response.json({
      accepted,
      retry,
      failed,
      skipped,
      attempted: claimed.length,
      candidateJobs: jobs.length,
      notice:
        "Accepted means the provider accepted a request, not that a message was delivered/read. Repeat scheduled calls to drain the queue and process eligible retries.",
    });
  } catch (error) {
    if (error instanceof RequestBodyError)
      return Response.json({ error: error.message }, { status: error.status });
    return Response.json(
      {
        error:
          "The integration store is unavailable. No data was reset and no success is assumed.",
      },
      { status: 503 },
    );
  }
}
