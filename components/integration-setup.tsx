"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  Globe2,
  KeyRound,
  Mail,
  MessageCircle,
  Plus,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { authFetch, AUTH_CHANGED, browserSession } from "@/lib/auth-client";
import { sessionScope } from "@/lib/auth-types";
import { INTEGRATION_SETUP_GUIDES } from "@/lib/integration-onboarding";
import type { NotificationExecutionReadiness } from "@/lib/notification-execution-types";
import type {
  WebhookReceiverView,
  WebhookStorageStatus,
} from "@/lib/webhook-inbox-types";

interface SetupData {
  execution: NotificationExecutionReadiness;
  storage: WebhookStorageStatus;
  origin: { origin: string; publicHttps: boolean } | null;
  encryptionKeyConfigured: boolean;
  receivers: WebhookReceiverView[];
  mockIdentity: boolean;
  emailSenderMode?: "unconfigured" | "restricted-test" | "custom-domain";
}
const ICONS = { whatsapp: MessageCircle, email: Mail, webhook: Globe2 };
const STORAGE_NOTICES: Record<WebhookStorageStatus["reason"], string> = {
  ready: "Private receiver storage is ready.",
  postgres_required:
    "Receiver creation requires PostgreSQL. Provider setup guidance remains available; no temporary-file receiver is created.",
  migration_required:
    "Apply migration 003_webhook_receivers.sql before creating receivers. No existing data will be reset.",
  storage_unavailable:
    "Receiver storage is unavailable. No fallback or empty replacement inbox is assumed.",
};
export function IntegrationSetup() {
  const { session } = useAuth();
  const [scope] = useState(() => sessionScope(session.user));
  const mounted = useRef(false);
  const [data, setData] = useState<SetupData | null>(null),
    [error, setError] = useState("");
  const [label, setLabel] = useState(""),
    [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [oneTime, setOneTime] = useState<{ id: string; secret: string } | null>(
      null,
    ),
    [reveal, setReveal] = useState(false);
  const active = () =>
    mounted.current && sessionScope(browserSession().user) === scope;
  async function load() {
    const response = await authFetch("/api/integrations/webhooks"),
      body = await response.json();
    if (!active()) return;
    if (!response.ok)
      throw new Error(body.error ?? "Integration setup is unavailable.");
    setData(body);
    setError("");
  }
  useEffect(() => {
    mounted.current = true;
    const changed = () => {
      setOneTime(null);
      setReveal(false);
    };
    window.addEventListener(AUTH_CHANGED, changed);
    const abort = new AbortController();
    void authFetch("/api/integrations/webhooks", { signal: abort.signal })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok)
          throw new Error(body.error ?? "Integration setup is unavailable.");
        return body as SetupData;
      })
      .then((body) => {
        if (active()) {
          setData(body);
          setError("");
        }
      })
      .catch((e) => {
        if (active())
          setError(e instanceof Error ? e.message : "Setup is unavailable.");
      });
    return () => {
      mounted.current = false;
      abort.abort();
      window.removeEventListener(AUTH_CHANGED, changed);
    };
    // Identity transitions remount this page; older async results additionally check the captured scope.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function action(
    kind: "create" | "rotate" | "enable" | "disable" | "test",
    id = "",
  ) {
    if (busy || !active()) return;
    if (
      kind === "rotate" &&
      !window.confirm(
        "Rotate this receiver's signing key? The old key will immediately stop working. Update the external sender after saving the new one-time key.",
      )
    )
      return;
    setBusy(kind + ":" + id);
    setError("");
    setNotice("");
    try {
      const response = await authFetch("/api/integrations/webhooks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: kind,
          id,
          ...(kind === "create" ? { label } : {}),
        }),
      });
      const result = await response.json();
      if (!active()) return;
      if (!response.ok)
        throw new Error(result.error ?? "Receiver action failed.");
      if (typeof result.secret === "string") {
        setOneTime({ id: result.receiver.id, secret: result.secret });
        setReveal(false);
      }
      if (kind === "create") {
        setLabel("");
        setNotice(
          "Receiver created. Save its one-time signing key privately; no subscription, provider send or capture was created.",
        );
      } else if (kind === "test")
        setNotice(
          "Local verifier/storage test passed. No external request, WhatsApp/email message or captured-airplay record was created.",
        );
      else
        setNotice(
          kind === "rotate"
            ? "Signing key rotated. Update the sender; the previous key is no longer valid."
            : "Receiver " +
                (kind === "enable" ? "enabled" : "disabled") +
                ". Receipt history is retained.",
        );
      await load();
    } catch (e) {
      if (active())
        setError(e instanceof Error ? e.message : "Receiver action failed.");
    } finally {
      if (active()) setBusy("");
    }
  }
  async function copy(value: string, message: string) {
    if (!active()) return;
    try {
      await navigator.clipboard.writeText(value);
      if (active()) setNotice(message);
    } catch {
      if (active())
        setError(
          "Clipboard access was blocked. Reveal/select the value and copy it manually.",
        );
    }
  }
  if (sessionScope(session.user) !== scope)
    return (
      <p role="status" className="panel p-5 text-sm text-muted">
        The account changed. Reloading your private setup workspace…
      </p>
    );
  const canCreate =
    !!data?.storage.available &&
    !!data.origin &&
    data.encryptionKeyConfigured &&
    !data.mockIdentity &&
    data.receivers.length < 5;
  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-10">
      <Link
        href="/dashboard/alerts"
        className="inline-flex items-center gap-2 text-xs text-muted hover:text-brand"
      >
        <ArrowLeft size={14} /> Airplay alerts
      </Link>
      <header className="panel overflow-hidden p-6 sm:p-8">
        <p className="eyebrow">CONNECT WITHOUT GUESSING</p>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-5">
          <div className="max-w-2xl">
            <h1 className="text-2xl font-semibold sm:text-3xl">
              Your notification setup
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              WhatsApp Business, email and signed webhooks have different setup
              requirements. Keep your existing phone account and inbox; connect
              real senders before activating delivery.
            </p>
          </div>
          <button
            className="btn btn-ghost !text-xs"
            type="button"
            disabled={!!busy}
            onClick={() => void load().catch((e) => setError(e.message))}
          >
            <RefreshCw size={14} /> Refresh status
          </button>
        </div>
        <div className="mt-6 grid gap-3 text-xs sm:grid-cols-3">
          <div className="rounded-xl border border-line bg-surface-raised p-3">
            <span className="block text-muted">Production sending</span>
            <strong className="mt-1 block">
              {data
                ? data.execution.liveEnabled
                  ? "Operator switch on"
                  : "Off — no real sends"
                : "Checking…"}
            </strong>
          </div>
          <div className="rounded-xl border border-line bg-surface-raised p-3">
            <span className="block text-muted">Automatic dispatcher</span>
            <strong className="mt-1 block">
              {data
                ? data.execution.immediateDispatchReady
                  ? "Settings present; approval still required"
                  : "Waiting for operator setup"
                : "Checking…"}
            </strong>
          </div>
          <div className="rounded-xl border border-line bg-surface-raised p-3">
            <span className="block text-muted">Scheduled retry safety net</span>
            <strong className="mt-1 block">
              {data
                ? data.execution.scheduledRetriesConfigured
                  ? "Authenticated daily maintenance configured"
                  : "Scheduler authentication missing"
                : "Checking…"}
            </strong>
          </div>
        </div>
        <p className="mt-4 text-[11px] leading-relaxed text-muted">
          Provider settings being present does not prove approval, acceptance or
          delivery. Global credentials and live/worker switches belong in the
          platform operator’s secure Production settings—not this browser, chat
          or localStorage. Daily cron is not a prompt retry guarantee.
        </p>
      </header>
      {error && (
        <p
          role="alert"
          className="rounded-xl border border-red-400/30 bg-red-400/5 p-4 text-xs text-red-200"
        >
          {error}
        </p>
      )}
      {notice && (
        <p
          role="status"
          className="rounded-xl border border-brand/30 bg-brand/5 p-4 text-xs text-brand"
        >
          {notice}
        </p>
      )}
      <section
        className="grid items-start gap-4 lg:grid-cols-3"
        aria-label="Provider setup guides"
      >
        {INTEGRATION_SETUP_GUIDES.map((guide) => {
          const Icon = ICONS[guide.id],
            configured = data?.execution.providers[guide.id];
          return (
            <article key={guide.id} className="panel min-w-0 p-5">
              <div className="flex items-center justify-between gap-2">
                <Icon className="text-brand" size={21} />
                <span className="chip !text-[9px]">
                  {configured ? "Server settings present" : "Setup required"}
                </span>
              </div>
              <h2 className="mt-4 text-lg font-semibold">{guide.title}</h2>
              <p className="mt-2 text-xs leading-relaxed text-muted">
                {guide.description}
              </p>
              {guide.id === "email" &&
                data?.emailSenderMode === "restricted-test" && (
                  <p
                    role="status"
                    className="mt-3 rounded-lg border border-amber-400/30 p-3 text-xs text-amber-200"
                  >
                    Restricted Resend test sender: only the Resend-account inbox
                    can receive testing emails. This is not production email
                    delivery.
                  </p>
                )}
              <ol className="mt-4 list-decimal space-y-3 pl-4 text-xs leading-relaxed">
                {guide.requirements.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
              <details className="mt-5 rounded-lg border border-line p-3">
                <summary className="cursor-pointer text-[11px] font-medium">
                  Operator environment variable names
                </summary>
                <div className="mt-3 space-y-2">
                  {guide.variables.map((key) => (
                    <code
                      key={key}
                      className="block break-all text-[10px] text-muted"
                    >
                      {key}
                    </code>
                  ))}
                </div>
                <p className="mt-3 text-[10px] text-muted">
                  Production only. Sensitive values stay in the provider/Vercel
                  secret settings; never paste them here.
                </p>
              </details>
              {guide.links.length > 0 && (
                <div className="mt-4 flex flex-col items-start gap-2">
                  {guide.links.map((link) => (
                    <a
                      key={link.href}
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-xs text-brand"
                    >
                      {link.label}
                      <ExternalLink size={12} />
                    </a>
                  ))}
                </div>
              )}
            </article>
          );
        })}
      </section>
      <section
        className="panel p-5 sm:p-6"
        aria-label="Private signed webhook inbox"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="eyebrow">YOUR OWN INTEGRATION INBOX</p>
            <h2 className="mt-2 flex items-center gap-2 text-xl font-semibold">
              <ShieldCheck className="text-brand" size={20} /> Private webhook
              receivers
            </h2>
            <p className="mt-3 max-w-3xl text-xs leading-relaxed text-muted">
              Receipts prove that a sender held this receiver’s signing key—not
              that a broadcast, licence, royalty or message delivery is
              verified. This inbox never forwards events, creates captures or
              loops them into the notification queue.
            </p>
          </div>
          <span className="chip">
            {data?.receivers.length ?? 0} / 5 receivers
          </span>
        </div>
        {data && (
          <p className="mt-4 rounded-lg border border-line p-3 text-xs text-muted">
            {STORAGE_NOTICES[data.storage.reason]}{" "}
            {!data.origin
              ? "A canonical application origin is also required."
              : !data.origin.publicHttps
                ? "This local URL cannot receive remote HTTPS webhooks."
                : ""}{" "}
            {!data.encryptionKeyConfigured
              ? "Server encryption-key setup is required."
              : ""}{" "}
            {data.mockIdentity
              ? "Use a real, non-mock artist account to create receivers."
              : ""}
          </p>
        )}
        <form
          className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            void action("create");
          }}
        >
          <label className="min-w-0 flex-1">
            <span className="label">Receiver label</span>
            <input
              className="field"
              name="receiver-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              required
              minLength={2}
              maxLength={80}
              placeholder="For example: label operations inbox"
              disabled={!canCreate || !!busy}
            />
          </label>
          <button
            className="btn btn-primary shrink-0"
            type="submit"
            disabled={!canCreate || !!busy}
          >
            <Plus size={15} />
            {busy === "create:" ? "Creating…" : "Create private receiver"}
          </button>
        </form>
        {oneTime && (
          <div
            role="status"
            aria-label="One-time receiver signing key"
            className="mt-5 rounded-xl border border-amber-400/35 bg-amber-400/5 p-4"
          >
            <h3 className="flex items-center gap-2 text-sm font-semibold text-amber-200">
              <KeyRound size={16} /> Save this signing key now
            </h3>
            <p className="mt-2 text-xs leading-relaxed text-muted">
              Shown only for this create/rotate operation. Keep it in your
              secret manager and the authorised sender. It is not your Blob
              token or Meta access token. If lost, rotate it; reading the inbox
              never reveals it again.
            </p>
            <code
              className="mt-3 block overflow-hidden break-all rounded-lg border border-line bg-background p-3 text-xs"
              aria-label="Signing key value"
            >
              {reveal ? oneTime.secret : "•".repeat(32)}
            </code>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="btn btn-ghost !text-xs"
                onClick={() => setReveal(!reveal)}
              >
                {reveal ? <EyeOff size={14} /> : <Eye size={14} />}
                {reveal ? "Hide key" : "Reveal key"}
              </button>
              <button
                type="button"
                className="btn btn-ghost !text-xs"
                onClick={() =>
                  void copy(
                    oneTime.secret,
                    "Signing key copied. Store it privately; do not paste it into chat.",
                  )
                }
              >
                <Copy size={14} />
                Copy key
              </button>
              <button
                type="button"
                className="btn btn-ghost !text-xs"
                onClick={() => {
                  setOneTime(null);
                  setReveal(false);
                }}
              >
                Dismiss key
              </button>
            </div>
          </div>
        )}
        <div className="mt-6 space-y-4">
          {data?.receivers.map((receiver) => (
            <article
              key={receiver.id}
              className="rounded-xl border border-line p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h3 className="break-words font-semibold">
                    {receiver.label}
                  </h3>
                  <p className="mt-1 text-[10px] text-muted">
                    {receiver.enabled
                      ? "Accepting signed requests"
                      : "Disabled — history retained"}{" "}
                    · key generation {receiver.generation}
                  </p>
                  <code className="mt-3 block break-all text-[10px] text-muted">
                    {receiver.endpointUrl ?? "Canonical origin not configured"}
                  </code>
                </div>
                <span className="chip !text-[9px]">
                  {receiver.secretConfigured
                    ? "Key encrypted server-side"
                    : "Key unavailable"}
                </span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={!!busy || !receiver.enabled}
                  className="btn btn-ghost !text-xs"
                  onClick={() => void action("test", receiver.id)}
                >
                  <CheckCircle2 size={13} />
                  Run local verifier test
                </button>
                <button
                  type="button"
                  disabled={!!busy || !receiver.endpointUrl}
                  className="btn btn-ghost !text-xs"
                  onClick={() =>
                    void copy(
                      receiver.endpointUrl!,
                      "Receiver URL copied. The URL alone does not authorise a request.",
                    )
                  }
                >
                  <Copy size={13} />
                  Copy URL
                </button>
                <button
                  type="button"
                  disabled={!!busy}
                  className="btn btn-ghost !text-xs"
                  onClick={() => void action("rotate", receiver.id)}
                >
                  <KeyRound size={13} />
                  Rotate key
                </button>
                <button
                  type="button"
                  disabled={!!busy}
                  className="btn btn-ghost !text-xs"
                  onClick={() =>
                    void action(
                      receiver.enabled ? "disable" : "enable",
                      receiver.id,
                    )
                  }
                >
                  {receiver.enabled ? "Disable" : "Enable"}
                </button>
              </div>
              <details className="mt-4 rounded-lg border border-line p-3">
                <summary className="cursor-pointer text-xs">
                  {receiver.receipts.length} most recent private receipts
                </summary>
                <p className="mt-3 text-[10px] leading-relaxed text-muted">
                  Only minimized payload fields are retained. Signature
                  verification is not airplay verification. Duplicate signed
                  event IDs are acknowledged without creating a second receipt.
                </p>
                {receiver.receipts.length === 0 ? (
                  <p className="mt-3 text-xs text-muted">
                    No receipts yet. The local verifier test creates an
                    explicitly marked configuration receipt without making an
                    external request.
                  </p>
                ) : (
                  <ol className="mt-3 space-y-3">
                    {receiver.receipts.map((receipt) => (
                      <li
                        key={receipt.id}
                        className="rounded-lg bg-surface-raised p-3 text-xs"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="chip !text-[9px]">
                            {receipt.summary.kind === "configuration-test"
                              ? "Configuration test · not airplay"
                              : "Signed external claim · unverified airplay"}
                          </span>
                          <time
                            className="text-[10px] text-muted"
                            dateTime={receipt.receivedAt}
                          >
                            {new Date(receipt.receivedAt).toLocaleString(
                              "en-GB",
                              { timeZone: "Africa/Kampala" },
                            )}{" "}
                            EAT
                          </time>
                        </div>
                        <p className="mt-2 break-words leading-relaxed">
                          {receipt.summary.message}
                        </p>
                        {receipt.summary.truncated && (
                          <p className="mt-1 text-[10px] text-muted">
                            Long fields were minimized for this integration
                            inbox.
                          </p>
                        )}
                      </li>
                    ))}
                  </ol>
                )}
              </details>
            </article>
          ))}
        </div>
        <p className="mt-5 text-[10px] leading-relaxed text-muted">
          The local test checks signing, replay-safe storage and your inbox
          only; it does not prove public-network delivery. This is not a Meta or
          Resend delivery-status callback endpoint. Outgoing subscriptions still
          require explicit owner consent and an exact operator-approved webhook
          URL. Receipt retention/purge is a reviewed operational policy, never a
          silent account/data reset.
        </p>
      </section>
    </div>
  );
}
