"use client";
import type { NotificationExecutionReadiness } from "@/lib/notification-execution-types";
import { useEffect, useState } from "react";
import { Inbox, RefreshCw } from "lucide-react";
import { authFetch } from "@/lib/auth-client";
interface Job {
  id: string;
  channel: string;
  status: string;
  attempts: number;
  queuedAt: string;
  message?: string;
  title?: string;
  code?: string;
}
export function AccountOutboxPanel() {
  const [execution, setExecution] =
    useState<NotificationExecutionReadiness | null>(null);
  const [jobs, setJobs] = useState<Job[] | null>(null),
    [error, setError] = useState("");
  async function refresh() {
    const response = await authFetch("/api/notifications/outbox"),
      body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "Outbox unavailable.");
    setJobs(body.jobs);
    setExecution(body.execution ?? null);
    setError("");
  }
  useEffect(() => {
    let closed = false;
    const load = () =>
      authFetch("/api/notifications/outbox")
        .then(async (response) => {
          const body = await response.json();
          if (!response.ok)
            throw new Error(body.error ?? "Outbox unavailable.");
          if (!closed) {
            setJobs(body.jobs);
            setExecution(body.execution ?? null);
            setError("");
          }
        })
        .catch((e) => {
          if (!closed) setError(e.message);
        });
    void load();
    const timer = setInterval(load, 15000);
    return () => {
      closed = true;
      clearInterval(timer);
    };
  }, []);
  return (
    <section
      className="panel p-5"
      aria-label="Private automatic notification outbox"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Inbox size={16} className="text-brand" />
            Your automatic event outbox
          </h2>
          <p className="mt-2 text-[11px] leading-relaxed text-muted">
            New captured spins enqueue matching opted-in subscriptions
            automatically. Queued is not sent; accepted means provider
            acceptance, never a delivery/read receipt. Simulations below never
            enter this queue.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-ghost !text-[10px]"
          onClick={() => void refresh().catch((e) => setError(e.message))}
        >
          <RefreshCw size={12} />
          Refresh
        </button>
      </div>
      {execution && (
        <div
          role="status"
          className="mt-4 rounded-xl border border-line bg-surface-raised p-3 text-xs"
        >
          <p className="font-medium">
            {execution.immediateDispatchReady
              ? "Automatic live dispatch configured"
              : "Live delivery is waiting for operator configuration"}
          </p>
          <p className="mt-1 text-[11px] text-muted">
            WhatsApp:{" "}
            {execution.providers.whatsapp ? "configured" : "not configured"} ·
            Email: {execution.providers.email ? "configured" : "not configured"}{" "}
            · Webhook:{" "}
            {execution.providers.webhook ? "configured" : "not configured"}
          </p>
          {execution.missing.length > 0 && (
            <ul className="mt-2 list-inside list-disc text-[11px] text-amber-200">
              {execution.missing.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-[10px] text-muted">
            A captured event triggers a bounded dispatch attempt. Daily cron is
            a retry safety net; timely retries require a more frequent external
            scheduler or the persistent worker. Provider configuration does not
            prove provider approval or successful delivery.
          </p>
        </div>
      )}
      {error && (
        <p role="status" className="mt-3 text-xs text-amber-200">
          {error}
        </p>
      )}
      {jobs?.length ? (
        <div className="mt-4 space-y-2">
          {jobs.slice(0, 20).map((j) => (
            <div
              key={j.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line p-3 text-[11px]"
            >
              <p className="min-w-0 flex-1 break-words">
                {j.message ?? j.title ?? "Captured airplay alert"}
                <span className="mt-1 block text-[9px] text-muted">
                  {j.channel} · {j.attempts} attempt
                  {j.attempts === 1 ? "" : "s"}
                  {j.code ? " · " + j.code : ""}
                </span>
              </p>
              <span className="chip">{j.status}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-4 rounded-xl border border-dashed border-line p-5 text-xs text-muted">
          {jobs
            ? "No notification jobs for this account yet. Add a subscription for one of your delivered masters, then ingest an authorised capture."
            : "Loading your scoped queue…"}
        </p>
      )}
    </section>
  );
}
