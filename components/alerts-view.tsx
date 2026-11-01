"use client";

import { useState } from "react";
import {
  Bell,
  Check,
  CheckCheck,
  ChevronRight,
  Copy,
  Download,
  Edit3,
  Globe2,
  Mail,
  MessageCircle,
  Pause,
  Play,
  Plus,
  Radio,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trash2,
  Wifi,
  X,
} from "lucide-react";
import { AirplayKpis } from "@/components/airplay-kpis";
import { Dialog } from "@/components/dialog";
import { NotificationConfigDialog } from "@/components/notification-config-dialog";
import { NotificationSubscriptionDialog } from "@/components/notification-subscription-dialog";
import { NotificationDigests } from "@/components/notification-digests";
import { PageIntro } from "@/components/page-intro";
import {
  activeSubscriptionCount,
  channelReady,
  notificationCandidates,
  notificationWebhookPayload,
  subscriptionIssues,
  testNotification,
  TRIGGERS,
  type AlertSubscription,
  type NotificationEvent,
  type NotificationPreferences,
  type ProviderReadiness,
  type TriggerId,
} from "@/lib/notifications";
import {
  readNotificationPreferences,
  useNotificationPreferences,
} from "@/lib/use-notification-preferences";
import { currentCapturedWindow } from "@/lib/captured-airplay";
import { useCapturedFeed } from "@/lib/use-captured-feed";
import { formatEatClock, formatNumber } from "@/lib/format";
import { FM_STATIONS } from "@/lib/regions";
import type { BroadcastSpin } from "@/lib/playout";
import type { Track } from "@/lib/types";

const DISCONNECTED: ProviderReadiness = {
  whatsapp: false,
  email: false,
  webhook: false,
  liveEnabled: false,
  worker: false,
};
const CHANNEL_ICONS = { whatsapp: MessageCircle, email: Mail, webhook: Globe2 };
type Tab = "subscriptions" | "digests" | "delivery";
const TABS = [
  { id: "subscriptions", label: "Subscriptions", icon: Bell },
  { id: "digests", label: "Email digests", icon: Mail },
  { id: "delivery", label: "Delivery & webhooks", icon: Globe2 },
] as const;
const maskPhone = (phone: string) =>
  phone
    ? `${phone.startsWith("+256") ? "+256" : "+"} ••• ••• ${phone.slice(-3)}`
    : "No recipient bound · preview only";

export function AlertsView({
  catalogue,
  now,
  initialEvents = [],
  canPoll = false,
  providers = DISCONNECTED,
}: {
  catalogue: Track[];
  now: string;
  initialEvents?: BroadcastSpin[];
  canPoll?: boolean;
  providers?: ProviderReadiness;
}) {
  const { config, save, invalid, sessionOnly } = useNotificationPreferences();
  const feed = useCapturedFeed(initialEvents, now, canPoll);
  const [tab, setTab] = useState<Tab>("subscriptions");
  const [channelModal, setChannelModal] = useState<
    "whatsapp" | "email" | "webhook" | null
  >(null);
  const [editing, setEditing] = useState<AlertSubscription | null>(null);
  const [removing, setRemoving] = useState<AlertSubscription | null>(null);
  const [phonePreview, setPhonePreview] = useState<NotificationEvent | null>(
    null,
  );
  const [testTrigger, setTestTrigger] = useState<TriggerId>("prime");
  const [notice, setNotice] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [showPrivateExport, setShowPrivateExport] = useState(false);
  const [copied, setCopied] = useState(false);
  const active = activeSubscriptionCount(config, catalogue);
  const scopedEvents = currentCapturedWindow(feed.events, new Date(feed.now));
  const candidates = notificationCandidates(
    feed.events,
    catalogue,
    config,
    new Date(feed.now),
  );
  const sample =
    phonePreview ??
    testNotification(catalogue, config, new Date(feed.now), testTrigger);
  const samplePayload = sample
    ? JSON.stringify(notificationWebhookPayload(sample), null, 2)
    : null;
  const liveReady = providers.liveEnabled && providers.worker;
  function persist(next: NotificationPreferences, message: string) {
    try {
      const result = save(next);
      setNotice(
        result.persisted
          ? message
          : "Changes are available in this session only; browser storage is unavailable.",
      );
      return true;
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Changes could not be saved.",
      );
      return false;
    }
  }
  function newSubscription() {
    setEditing({
      id: `sub-${crypto.randomUUID()}`,
      name: "",
      trackId: catalogue[0]?.id ?? "all",
      stationId: "all",
      region: "All",
      channels: ["whatsapp"],
      triggers: ["first", "milestone", "prime"],
      milestones: [100, 1000],
      enabled: true,
      createdAt: new Date().toISOString(),
    });
  }
  function runTest(trigger = testTrigger) {
    const event = testNotification(catalogue, config, new Date(), trigger);
    if (event) {
      setPhonePreview(event);
      setCopied(false);
    }
  }
  const subscriptions = config.subscriptions.filter((sub) => {
    const track = catalogue.find((entry) => entry.id === sub.trackId);
    const ready =
      sub.enabled &&
      !subscriptionIssues(sub, catalogue).length &&
      sub.channels.some((channel) => channelReady(config, channel));
    if (filter === "active" && !ready) return false;
    if (filter === "paused" && sub.enabled) return false;
    if (filter === "setup" && (!sub.enabled || ready)) return false;
    return `${sub.name} ${track?.title ?? "all recordings"} ${track?.primaryArtist ?? ""}`
      .toLowerCase()
      .includes(query.trim().toLowerCase());
  });
  return (
    <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-6 pb-6">
      <PageIntro
        eyebrow="AIRPLAY ALERTS & WEBHOOKS"
        title="Your next play. Never missed."
        description="From the first captured spin to the next milestone. Put the right update in the right hands, across WhatsApp, email and your label’s own tools."
        actions={
          <>
            <button
              type="button"
              className="btn btn-ghost !text-xs"
              onClick={() => setChannelModal("whatsapp")}
            >
              <Settings2 size={15} />
              Configure channels
            </button>
            <button
              type="button"
              className="btn btn-primary !text-xs"
              disabled={!catalogue.length}
              onClick={() => runTest()}
            >
              <MessageCircle size={15} />
              Test WhatsApp Notification
            </button>
          </>
        }
      />
      <AirplayKpis
        catalogue={catalogue}
        events={scopedEvents}
        scope="Captured records · last 14 EAT days"
      />
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand/15 bg-brand/5 px-4 py-3">
        <p className="flex items-center gap-2 text-[11px] font-medium text-brand">
          <ShieldCheck size={14} className="shrink-0" />
          Real releases. Capture-backed analytics. Explicit opt-in.
        </p>
        <span className="text-[10px] text-muted">
          {liveReady
            ? "Authenticated worker configured · provider acceptance is not a delivery receipt"
            : "Local configuration mode · live delivery is not connected"}
        </span>
      </div>
      {(invalid || sessionOnly || feed.unavailable) && (
        <p
          role="alert"
          className="rounded-xl border border-amber-300/50 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900"
        >
          {invalid
            ? "Saved notification settings are invalid or from an unsupported version. They have not been silently overwritten. Review and save a fresh configuration. "
            : ""}
          {sessionOnly
            ? "Browser storage is unavailable; settings will not survive a new session. "
            : ""}
          {feed.unavailable
            ? "The capture feed is unavailable. Showing the last received snapshot."
            : ""}
        </p>
      )}
      <section
        className="grid gap-3 md:grid-cols-3"
        aria-label="Channel connection status"
      >
        {(
          [
            {
              id: "whatsapp",
              title: "WhatsApp Business",
              detail: config.whatsapp.phone
                ? maskPhone(config.whatsapp.phone)
                : "Bind an opted-in recipient",
              icon: MessageCircle,
            },
            {
              id: "email",
              title: "Email summaries",
              detail: config.email.address
                ? "Recipient saved locally"
                : "Daily recaps & weekly trends",
              icon: Mail,
            },
            {
              id: "webhook",
              title: "Label integrations",
              detail: `${config.webhooks.filter((hook) => hook.enabled).length} enabled endpoint${config.webhooks.filter((hook) => hook.enabled).length === 1 ? "" : "s"} · JSON / Discord / Telegram`,
              icon: Globe2,
            },
          ] as const
        ).map((channel) => (
          <button
            key={channel.id}
            type="button"
            className="panel group flex min-w-0 items-start gap-3 p-4 text-left transition-colors hover:!border-brand/40"
            onClick={() => setChannelModal(channel.id)}
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand/7 text-brand">
              <channel.icon size={19} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold">{channel.title}</span>
                <span
                  className={`rounded-full px-2 py-1 text-[9px] ${channelReady(config, channel.id) ? "bg-brand/10 text-brand" : "bg-surface-2 text-muted"}`}
                >
                  {channelReady(config, channel.id)
                    ? "Recipient configured"
                    : "Setup needed"}
                </span>
              </span>
              <span className="mt-2 block text-[10px] leading-relaxed text-muted">
                {channel.detail}
              </span>
              <span className="mt-2 flex items-center gap-1 text-[9px] text-muted">
                {providers[channel.id]
                  ? "Server credentials present · not independently verified"
                  : "Server provider not configured"}
                <ChevronRight size={11} />
              </span>
            </span>
          </button>
        ))}
      </section>
      <div
        role="tablist"
        aria-label="Notification center views"
        className="flex flex-wrap gap-x-5 gap-y-1 border-b border-line"
      >
        {TABS.map((item, index) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`notification-tab-${item.id}`}
            aria-selected={tab === item.id}
            aria-controls={`notification-panel-${item.id}`}
            tabIndex={tab === item.id ? 0 : -1}
            className={`-mb-px flex items-center gap-2 border-b-2 py-3 text-[11px] font-medium ${tab === item.id ? "border-brand text-brand" : "border-transparent text-muted"}`}
            onClick={() => setTab(item.id)}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
                event.preventDefault();
                const next =
                  TABS[
                    (index +
                      (event.key === "ArrowRight" ? 1 : -1) +
                      TABS.length) %
                      TABS.length
                  ];
                setTab(next.id);
                document.getElementById(`notification-tab-${next.id}`)?.focus();
              }
            }}
          >
            <item.icon size={14} />
            {item.label}
            {item.id === "subscriptions" && (
              <span className="rounded bg-brand/7 px-1.5 py-0.5 text-[9px]">
                {config.subscriptions.length}
              </span>
            )}
          </button>
        ))}
      </div>
      {notice && (
        <div
          role="status"
          className="flex items-start justify-between gap-3 rounded-xl border border-brand/20 bg-brand/5 p-3 text-xs leading-relaxed text-brand"
        >
          <span>{notice}</span>
          <button
            type="button"
            className="shrink-0"
            aria-label="Dismiss notification status"
            onClick={() => setNotice(null)}
          >
            <X size={14} />
          </button>
        </div>
      )}
      <div
        role="tabpanel"
        id={`notification-panel-${tab}`}
        aria-labelledby={`notification-tab-${tab}`}
        className="min-w-0"
      >
        {tab === "subscriptions" && (
          <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="eyebrow">YOUR NOTIFICATION NETWORK</p>
                <h2 className="mt-1 text-base font-semibold">
                  Every important spin, on your terms.
                </h2>
                <p className="mt-1 text-[11px] text-muted">
                  {active} active subscription{active === 1 ? "" : "s"} ·{" "}
                  {config.subscriptions.length} configured · {candidates.length}{" "}
                  matching capture/channel candidates in available history
                </p>
              </div>
              <button
                type="button"
                className="btn btn-primary !text-xs"
                disabled={config.subscriptions.length >= 100}
                onClick={newSubscription}
              >
                <Plus size={15} />
                New subscription
              </button>
            </div>
            {config.subscriptions.length > 0 && (
              <div className="flex flex-wrap gap-2">
                <label className="relative min-w-0 flex-1 basis-60">
                  <Search
                    size={14}
                    aria-hidden
                    className="absolute left-3 top-3 text-muted"
                  />
                  <input
                    className="field !bg-surface !pl-9 !text-xs"
                    type="search"
                    aria-label="Search notification subscriptions"
                    placeholder="Search a campaign, recording or artist…"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </label>
                <select
                  className="field !w-auto !bg-surface !text-xs"
                  aria-label="Filter subscription status"
                  value={filter}
                  onChange={(event) => setFilter(event.target.value)}
                >
                  <option value="all">All subscriptions</option>
                  <option value="active">Active & ready</option>
                  <option value="paused">Paused</option>
                  <option value="setup">Setup needed</option>
                </select>
              </div>
            )}
            {subscriptions.length ? (
              <div className="grid gap-3 xl:grid-cols-2">
                {subscriptions.map((sub) => {
                  const track = catalogue.find(
                    (entry) => entry.id === sub.trackId,
                  );
                  const ready =
                    sub.enabled &&
                    !subscriptionIssues(sub, catalogue).length &&
                    sub.channels.some((channel) =>
                      channelReady(config, channel),
                    );
                  const station = FM_STATIONS.find(
                    (entry) => entry.id === sub.stationId,
                  );
                  return (
                    <article
                      key={sub.id}
                      aria-label={`Subscription: ${sub.name}`}
                      className="panel min-w-0 p-4 sm:p-5"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="break-words text-sm font-semibold">
                              {sub.name}
                            </h3>
                            <span
                              className={`rounded-full px-2 py-1 text-[9px] ${!sub.enabled ? "bg-surface-2 text-muted" : ready ? "bg-brand/10 text-brand" : "bg-amber-50 text-amber-800"}`}
                            >
                              {!sub.enabled
                                ? "Paused"
                                : ready
                                  ? "Active · locally ready"
                                  : "Setup needed"}
                            </span>
                          </div>
                          <p className="mt-2 text-xs font-medium">
                            {sub.trackId === "all"
                              ? "All catalogue recordings"
                              : (track?.title ??
                                "Recording no longer available")}
                          </p>
                          <p className="mt-1 text-[10px] text-muted">
                            {track?.primaryArtist ??
                              "Catalogue-wide subscription"}
                          </p>
                        </div>
                        <button
                          type="button"
                          className="icon-btn !h-8 !w-8 shrink-0"
                          aria-label={`Edit ${sub.name}`}
                          onClick={() => setEditing(sub)}
                        >
                          <Edit3 size={14} />
                        </button>
                      </div>
                      <p className="mt-4 flex items-center gap-1.5 text-[10px] text-muted">
                        <Radio size={12} />
                        {station?.name ?? "All FM stations"} ·{" "}
                        {sub.region === "All" ? "All Uganda" : sub.region} · EAT
                      </p>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {sub.triggers.map((trigger) => (
                          <span
                            key={trigger}
                            className="rounded-md bg-surface-2 px-2 py-1 text-[9px] text-muted"
                          >
                            {trigger === "first"
                              ? "First captured FM play"
                              : trigger === "prime"
                                ? "Morning / drive time"
                                : `Milestones: ${sub.milestones.map((value) => formatNumber(value)).join(", ")}`}
                          </span>
                        ))}
                      </div>
                      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
                        <div className="flex flex-wrap gap-2">
                          {sub.channels.map((channel) => {
                            const Icon = CHANNEL_ICONS[channel];
                            return (
                              <span
                                key={channel}
                                className={`flex items-center gap-1 text-[10px] ${channelReady(config, channel) ? "text-brand" : "text-muted"}`}
                                title={
                                  channelReady(config, channel)
                                    ? "Recipient/endpoint configured locally"
                                    : "Configure this channel before dispatch"
                                }
                              >
                                <Icon size={12} />
                                {channel === "whatsapp"
                                  ? "WhatsApp"
                                  : channel === "email"
                                    ? "Email"
                                    : "Webhook"}
                                {channelReady(config, channel) && (
                                  <Check size={10} />
                                )}
                              </span>
                            );
                          })}
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            className="btn btn-ghost !px-2 !py-1.5 !text-[10px]"
                            aria-label={`${sub.enabled ? "Pause" : "Resume"} ${sub.name}`}
                            onClick={() => {
                              const current = readNotificationPreferences();
                              persist(
                                {
                                  ...current,
                                  subscriptions: current.subscriptions.map(
                                    (entry) =>
                                      entry.id === sub.id
                                        ? {
                                            ...entry,
                                            enabled: !entry.enabled,
                                            ...(!entry.enabled
                                              ? {
                                                  activatedAt:
                                                    new Date().toISOString(),
                                                }
                                              : {}),
                                          }
                                        : entry,
                                  ),
                                },
                                `${sub.name} ${sub.enabled ? "paused" : "enabled"}.`,
                              );
                            }}
                          >
                            {sub.enabled ? (
                              <Pause size={12} />
                            ) : (
                              <Play size={12} />
                            )}
                            {sub.enabled ? "Pause" : "Resume"}
                          </button>
                          <button
                            type="button"
                            className="icon-btn !h-7 !w-7"
                            aria-label={`Delete ${sub.name}`}
                            onClick={() => setRemoving(sub)}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="panel border-dashed px-5 py-12 text-center">
                <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand/7 text-brand">
                  <Bell size={25} strokeWidth={1.5} />
                </span>
                <h3 className="mt-4 text-sm font-semibold">
                  {config.subscriptions.length
                    ? "No subscriptions in this view."
                    : "Your next milestone deserves an alert."}
                </h3>
                <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-muted">
                  {config.subscriptions.length
                    ? "Try another status or search term."
                    : "Create a subscription for a real recording, choose first-play, milestone or prime-time triggers, then bind a recipient. Nothing is sent without your configuration."}
                </p>
                <button
                  type="button"
                  className="btn btn-primary mt-5 !text-xs"
                  onClick={() =>
                    config.subscriptions.length
                      ? (setQuery(""), setFilter("all"))
                      : newSubscription()
                  }
                >
                  {config.subscriptions.length
                    ? "Reset subscription filters"
                    : "Create first subscription"}
                  <Plus size={13} />
                </button>
              </div>
            )}
            <div className="grid gap-3 md:grid-cols-3">
              {TRIGGERS.map((trigger) => (
                <div
                  key={trigger.id}
                  className="rounded-xl border border-line p-4"
                >
                  <Sparkles size={16} className="text-brand" />
                  <h3 className="mt-3 text-xs font-semibold">
                    {trigger.label}
                  </h3>
                  <p className="mt-2 text-[10px] leading-relaxed text-muted">
                    {trigger.hint}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
        {tab === "digests" && (
          <NotificationDigests
            history={feed.events}
            catalogue={catalogue}
            config={config}
            now={feed.now}
            onConfigure={() => setChannelModal("email")}
          />
        )}
        {tab === "delivery" && (
          <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
            <section className="panel min-w-0 p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="eyebrow">CAPTURE → TRIGGER → ROUTE</p>
                  <h2 className="mt-1 text-base font-semibold">
                    Dispatch readiness
                  </h2>
                </div>
                <span className="chip !text-[9px]">
                  {liveReady ? "Worker configured" : "Not connected"}
                </span>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-muted">
                Captured events are evaluated against subscriptions. A protected
                server worker sends approved WhatsApp templates, email and
                signed webhooks, with idempotency, bounded retries and a durable
                attempt log. This browser never sends provider requests.
              </p>
              <ul className="mt-4 space-y-2">
                {[
                  ["Captured history available", feed.events.length > 0],
                  ["Active subscriptions configured", active > 0],
                  ["Live dispatch explicitly enabled", providers.liveEnabled],
                  ["Authenticated worker token configured", providers.worker],
                ].map(([label, ready]) => (
                  <li
                    key={String(label)}
                    className="flex items-center justify-between gap-3 rounded-xl border border-line p-3 text-xs"
                  >
                    <span>{label}</span>
                    <span
                      className={`text-[10px] ${ready ? "text-brand" : "text-muted"}`}
                    >
                      {ready ? "Ready" : "Setup needed"}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-[10px] leading-relaxed text-muted">
                Provider acceptance is not a handset delivery/read receipt.
                Configure provider callbacks and production authentication
                before relying on delivery status. Daily/weekly automation
                requires a scheduler.
              </p>
              <button
                type="button"
                className="btn btn-ghost mt-4 !text-xs"
                onClick={() => setShowPrivateExport(true)}
              >
                <Download size={13} />
                Export worker configuration
              </button>
            </section>
            <section className="panel min-w-0 p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="eyebrow">INTEGRATION PREVIEW</p>
                  <h2 className="mt-1 text-base font-semibold">
                    Webhook event contract
                  </h2>
                </div>
                <button
                  type="button"
                  className="btn btn-ghost !px-2.5 !py-2 !text-[10px]"
                  disabled={!samplePayload}
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(samplePayload!);
                      setCopied(true);
                    } catch {
                      setNotice(
                        "Clipboard unavailable. Select the JSON below or export the private worker configuration.",
                      );
                    }
                  }}
                >
                  {copied ? <Check size={12} /> : <Copy size={12} />}
                  {copied ? "Copied" : "Copy JSON"}
                </button>
              </div>
              <p className="mt-3 text-[11px] leading-relaxed text-muted">
                This sample is marked <code>simulator</code>. Live JSON payloads
                use <code>captured</code> and carry{" "}
                <code>X-East-Sound-Signature</code>,{" "}
                <code>X-East-Sound-Timestamp</code> and{" "}
                <code>Idempotency-Key</code> headers.
              </p>
              <div className="relative mt-4 min-w-0">
                <pre
                  className="max-h-[480px] overflow-auto rounded-xl border border-line bg-[#12272d] p-4 font-mono text-[10px] leading-relaxed text-[#c4e7d7]"
                  tabIndex={0}
                  aria-label="Sample webhook JSON"
                >
                  {samplePayload ??
                    "Add a recording to preview the event contract."}
                </pre>
              </div>
              <p className="mt-3 text-[10px] text-muted">
                No request is made to the configured endpoint by this preview.
              </p>
            </section>
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4 text-[10px] text-muted">
        <span className="flex items-center gap-1.5">
          <ShieldCheck size={12} />
          Recipients and subscriptions are saved in this browser, not an
          authenticated cloud account.
        </span>
        <span>
          {canPoll
            ? "Capture data refreshes every 15 seconds while visible"
            : "Read-only snapshot · no capture API available"}
        </span>
      </div>
      {channelModal && (
        <NotificationConfigDialog
          initialTab={channelModal}
          onClose={() => setChannelModal(null)}
          onSaved={setNotice}
        />
      )}
      {editing && (
        <NotificationSubscriptionDialog
          initial={editing}
          catalogue={catalogue}
          onClose={() => setEditing(null)}
          onSave={(subscription) => {
            subscription = {
              ...subscription,
              activatedAt: new Date().toISOString(),
            };
            const current = readNotificationPreferences();
            const existing = current.subscriptions.some(
              (sub) => sub.id === subscription.id,
            );
            if (
              persist(
                {
                  ...current,
                  subscriptions: existing
                    ? current.subscriptions.map((sub) =>
                        sub.id === subscription.id ? subscription : sub,
                      )
                    : [...current.subscriptions, subscription],
                },
                "Subscription saved. Only valid, opted-in channels count as locally active.",
              )
            )
              setEditing(null);
          }}
        />
      )}
      {removing && (
        <Dialog
          title="Delete airplay subscription?"
          onClose={() => setRemoving(null)}
        >
          <p className="text-xs leading-relaxed text-muted">
            Remove <strong className="text-foreground">{removing.name}</strong>{" "}
            from this browser? This does not delete any music, capture evidence
            or server delivery history.
          </p>
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              className="btn btn-ghost !text-xs"
              onClick={() => setRemoving(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary !text-xs"
              onClick={() => {
                const current = readNotificationPreferences();
                if (
                  persist(
                    {
                      ...current,
                      subscriptions: current.subscriptions.filter(
                        (sub) => sub.id !== removing.id,
                      ),
                    },
                    "Subscription removed.",
                  )
                )
                  setRemoving(null);
              }}
            >
              Delete subscription
            </button>
          </div>
        </Dialog>
      )}
      {showPrivateExport && (
        <Dialog
          title="Export private worker configuration"
          onClose={() => setShowPrivateExport(false)}
        >
          <p className="text-xs leading-relaxed text-muted">
            This JSON contains recipient contact details and endpoint URLs. Keep
            it private and use it only in an authenticated server worker. No API
            access tokens or signing secrets are included. Exporting does not
            activate delivery.
          </p>
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              className="btn btn-ghost !text-xs"
              onClick={() => setShowPrivateExport(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary !text-xs"
              onClick={() => {
                const url = URL.createObjectURL(
                  new Blob([JSON.stringify(config, null, 2)], {
                    type: "application/json",
                  }),
                );
                const link = document.createElement("a");
                link.href = url;
                link.download = "east-sound-notifications.private.json";
                link.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
                setShowPrivateExport(false);
                setNotice(
                  "Private configuration downloaded. Store it securely; no messages were sent.",
                );
              }}
            >
              Download private JSON
            </button>
          </div>
        </Dialog>
      )}
      {phonePreview && (
        <Dialog
          title="Test WhatsApp Notification"
          onClose={() => setPhonePreview(null)}
        >
          <p className="text-xs leading-relaxed text-muted">
            An interactive preview using real release metadata and a simulated
            play. No WhatsApp API call is made, no phone is contacted, and no
            audited spin is added.
          </p>
          <div
            className="mt-4 flex flex-wrap gap-1.5"
            role="group"
            aria-label="Test notification trigger"
          >
            {TRIGGERS.map((trigger) => (
              <button
                key={trigger.id}
                type="button"
                className={`btn !px-2.5 !py-2 !text-[10px] ${phonePreview.trigger === trigger.id ? "btn-primary" : "btn-ghost"}`}
                aria-pressed={phonePreview.trigger === trigger.id}
                onClick={() => {
                  setTestTrigger(trigger.id);
                  runTest(trigger.id);
                }}
              >
                {trigger.id === "first"
                  ? "First play"
                  : trigger.id === "milestone"
                    ? "Milestone"
                    : "Prime time"}
              </button>
            ))}
          </div>
          <div className="mx-auto mt-5 w-full max-w-[320px] overflow-hidden rounded-[28px] border-[6px] border-[#142a30] bg-[#e8efeb] shadow-xl">
            <div className="flex items-center justify-between bg-[#142a30] px-3 py-2 text-[10px] text-white">
              <span>
                {formatEatClock(phonePreview.atIso).replace(" EAT", "")}
              </span>
              <span className="flex items-center gap-1">
                <Wifi size={11} />
                <span>•••</span>
              </span>
            </div>
            <div className="flex items-center gap-2 bg-[#136651] px-3 py-3 text-white">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/20 text-[10px] font-bold">
                ES
              </span>
              <span className="min-w-0">
                <span className="block text-xs font-semibold">
                  East Sound Alerts
                </span>
                <span className="mt-0.5 block text-[9px] text-white/75">
                  Simulator · not a live WhatsApp session
                </span>
              </span>
            </div>
            <div className="min-h-60 p-3">
              <p className="mb-4 rounded-full bg-white/80 px-2 py-1 text-center text-[8px] text-[#47605a]">
                TEST PREVIEW · NO MESSAGE SENT
              </p>
              <div
                role="log"
                aria-live="polite"
                aria-label="Simulated WhatsApp notification"
                className="ml-2 rounded-xl rounded-tl-none bg-white p-3 shadow-sm"
              >
                <p className="whitespace-pre-wrap break-words text-[11px] leading-relaxed text-[#213c34]">
                  {phonePreview.message}
                </p>
                <p className="mt-3 flex items-center justify-end gap-1 text-[9px] text-[#5e7972]">
                  {formatEatClock(phonePreview.atIso)}
                  <CheckCheck size={12} className="text-[#38a1ce]" />
                </p>
              </div>
            </div>
            <p className="border-t border-[#cfddd5] bg-white px-3 py-3 text-center text-[9px] text-[#5e7972]">
              {maskPhone(config.whatsapp.phone)}
            </p>
          </div>
          <p className="mt-4 text-center text-[10px] leading-relaxed text-muted">
            Double ticks and the phone screen are illustrative. Tests are never
            treated as captured broadcasts or provider delivery receipts.
          </p>
        </Dialog>
      )}
    </div>
  );
}
