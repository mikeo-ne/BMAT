"use client";
import { useState } from "react";
import {
  Bell,
  Check,
  Globe2,
  Mail,
  MessageCircle,
  Plus,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { Dialog } from "@/components/dialog";
import {
  MESSAGE_TOKENS,
  normaliseWhatsappPhone,
  preferencesIssues,
  type NotificationPreferences,
} from "@/lib/notifications";
import {
  readNotificationPreferences,
  useNotificationPreferences,
} from "@/lib/use-notification-preferences";

type ConfigTab = "whatsapp" | "email" | "webhook";
const TABS = [
  { id: "whatsapp", label: "WhatsApp", icon: MessageCircle },
  { id: "email", label: "Email digests", icon: Mail },
  { id: "webhook", label: "Webhooks", icon: Globe2 },
] as const;
const DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export function NotificationConfigDialog({
  onClose,
  initialTab = "whatsapp",
  onSaved,
}: {
  onClose: () => void;
  initialTab?: ConfigTab;
  onSaved?: (message: string) => void;
}) {
  const { config, save } = useNotificationPreferences();
  const [draft, setDraft] = useState<NotificationPreferences>(() =>
    JSON.parse(JSON.stringify(config)),
  );
  const [tab, setTab] = useState<ConfigTab>(initialTab);
  const [errors, setErrors] = useState<string[]>([]);
  function submit() {
    const issues = preferencesIssues({
      ...draft,
      email: { ...draft.email, address: draft.email.address.trim() },
    });
    if (issues.length) {
      setErrors(issues);
      return;
    }
    try {
      const result = save({
        ...readNotificationPreferences(),
        whatsapp: {
          ...draft.whatsapp,
          phone: draft.whatsapp.phone
            ? normaliseWhatsappPhone(draft.whatsapp.phone)!
            : "",
        },
        email: { ...draft.email, address: draft.email.address.trim() },
        webhooks: draft.webhooks,
      });
      onSaved?.(
        result.persisted
          ? "Channel settings saved in this browser. Live provider delivery still requires a configured, authenticated worker."
          : "Settings are available for this session only; browser storage is unavailable.",
      );
      onClose();
    } catch (error) {
      setErrors([
        error instanceof Error ? error.message : "Settings could not be saved.",
      ]);
    }
  }
  return (
    <Dialog title="Airplay Alerts & Webhooks" onClose={onClose} wide>
      <p className="text-xs leading-relaxed text-muted">
        Configure recipients and routing. Settings stay in this browser; no
        access token, bot token or API key belongs here. Saving a number does
        not verify ownership or connect Meta automatically.
      </p>
      <div
        role="tablist"
        aria-label="Notification channels"
        className="mt-5 flex flex-wrap gap-1 border-b border-line pb-3"
      >
        {TABS.map((item, index) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`channel-tab-${item.id}`}
            aria-selected={tab === item.id}
            aria-controls={`channel-panel-${item.id}`}
            tabIndex={tab === item.id ? 0 : -1}
            className={`btn !px-3 !py-2 !text-xs ${tab === item.id ? "btn-primary" : "btn-ghost"}`}
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
                document.getElementById(`channel-tab-${next.id}`)?.focus();
              }
            }}
          >
            <item.icon size={14} />
            {item.label}
          </button>
        ))}
      </div>
      <form
        className="mt-5"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
        noValidate
      >
        <div
          role="tabpanel"
          id={`channel-panel-${tab}`}
          aria-labelledby={`channel-tab-${tab}`}
        >
          {tab === "whatsapp" && (
            <div className="space-y-5">
              <div className="rounded-xl border border-brand/20 bg-brand/5 p-4">
                <p className="flex items-center gap-2 text-xs font-semibold text-brand">
                  <MessageCircle size={16} />
                  WhatsApp Business Cloud API binding
                </p>
                <p className="mt-2 text-[11px] leading-relaxed text-muted">
                  A validated recipient plus explicit opt-in makes a channel
                  ready for configuration. Server credentials and an approved
                  Meta message template are required for live sends. The
                  simulator never contacts WhatsApp.
                </p>
              </div>
              <label className="block text-xs font-medium">
                WhatsApp phone number
                <input
                  className="field mt-2"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="+256 772 123456"
                  maxLength={40}
                  value={draft.whatsapp.phone}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      whatsapp: {
                        ...draft.whatsapp,
                        phone: event.target.value,
                      },
                    })
                  }
                />
                <span className="mt-1.5 block text-[10px] leading-relaxed text-muted">
                  International E.164 format. Uganda: +256 followed by nine
                  digits; do not include the local leading zero.
                </span>
              </label>
              <label className="flex items-start gap-2.5 text-xs leading-relaxed">
                <input
                  className="mt-0.5 h-4 w-4 shrink-0 accent-brand"
                  type="checkbox"
                  checked={draft.whatsapp.consent}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      whatsapp: {
                        ...draft.whatsapp,
                        consent: event.target.checked,
                      },
                    })
                  }
                />
                I have the recipient’s permission to receive these WhatsApp
                alerts.
              </label>
              <label className="block text-xs font-medium">
                Message template
                <textarea
                  rows={5}
                  className="field mt-2 resize-y !text-xs leading-relaxed"
                  maxLength={1000}
                  value={draft.whatsapp.template}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      whatsapp: {
                        ...draft.whatsapp,
                        template: event.target.value,
                      },
                    })
                  }
                />
              </label>
              <div>
                <p className="mb-2 text-[10px] text-muted">
                  Insert a supported token · {draft.whatsapp.template.length}
                  /1,000 characters
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {MESSAGE_TOKENS.map((token) => (
                    <button
                      key={token}
                      type="button"
                      className="rounded-md border border-line bg-surface-2 px-2 py-1.5 font-mono text-[10px] text-brand hover:border-brand"
                      onClick={() =>
                        setDraft({
                          ...draft,
                          whatsapp: {
                            ...draft.whatsapp,
                            template:
                              `${draft.whatsapp.template} {{${token}}}`.slice(
                                0,
                                1000,
                              ),
                          },
                        })
                      }
                    >{`{{${token}}}`}</button>
                  ))}
                </div>
              </div>
            </div>
          )}
          {tab === "email" && (
            <div className="space-y-5">
              <div className="rounded-xl border border-brand/20 bg-brand/5 p-4">
                <p className="flex items-center gap-2 text-xs font-semibold text-brand">
                  <Mail size={16} />
                  The morning after. The week in perspective.
                </p>
                <p className="mt-2 text-[11px] leading-relaxed text-muted">
                  Daily recaps cover the previous completed EAT day. Weekly
                  breakdowns cover the previous seven completed EAT days,
                  compared with the seven before them. Download a real PDF from
                  the Digests tab.
                </p>
              </div>
              <label className="block text-xs font-medium">
                Digest email address
                <input
                  className="field mt-2"
                  type="email"
                  autoComplete="email"
                  placeholder="airplay@your-label.com"
                  maxLength={254}
                  value={draft.email.address}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      email: { ...draft.email, address: event.target.value },
                    })
                  }
                />
              </label>
              <label className="flex items-start gap-2.5 text-xs leading-relaxed">
                <input
                  className="mt-0.5 h-4 w-4 shrink-0 accent-brand"
                  type="checkbox"
                  checked={draft.email.consent}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      email: { ...draft.email, consent: event.target.checked },
                    })
                  }
                />
                The recipient has opted in to these email notifications and
                digests.
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                {(
                  [
                    ["daily", "Daily morning recap"],
                    ["weekly", "Weekly regional trends"],
                  ] as const
                ).map(([key, label]) => (
                  <label
                    key={key}
                    className="flex items-center gap-2 rounded-xl border border-line p-3 text-xs"
                  >
                    <input
                      type="checkbox"
                      className="accent-brand"
                      checked={draft.email[key]}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          email: {
                            ...draft.email,
                            [key]: event.target.checked,
                          },
                        })
                      }
                    />
                    {label}
                  </label>
                ))}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-xs font-medium">
                  Delivery time (EAT)
                  <select
                    className="field mt-2"
                    value={draft.email.hour}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        email: {
                          ...draft.email,
                          hour: Number(event.target.value),
                        },
                      })
                    }
                  >
                    {Array.from({ length: 24 }, (_, hour) => (
                      <option key={hour} value={hour}>
                        {String(hour).padStart(2, "0")}:00 EAT
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs font-medium">
                  Weekly digest day
                  <select
                    className="field mt-2"
                    value={draft.email.weeklyDay}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        email: {
                          ...draft.email,
                          weeklyDay: Number(event.target.value),
                        },
                      })
                    }
                  >
                    {DAYS.map((day, index) => (
                      <option key={day} value={index}>
                        {day}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <p className="text-[11px] leading-relaxed text-muted">
                The schedule is configuration, not a background browser timer.
                Automatic delivery requires the authenticated scheduled worker
                and the server-side email provider.
              </p>
            </div>
          )}
          {tab === "webhook" && (
            <div className="space-y-4">
              <p className="text-xs leading-relaxed text-muted">
                Route events to a label backend, a Discord webhook, or a
                Telegram relay. Use your own label name; East Sound does not
                imply any label affiliation. Sensitive webhook URLs are stored
                locally—never paste a bot or API token into this interface.
              </p>
              {draft.webhooks.length === 0 && (
                <div className="rounded-xl border border-dashed border-line p-6 text-center text-xs text-muted">
                  No webhook destinations yet. Add an endpoint to preview its
                  payload.
                </div>
              )}
              {draft.webhooks.map((hook, index) => (
                <fieldset
                  key={hook.id}
                  className="min-w-0 space-y-3 rounded-xl border border-line p-4"
                >
                  <legend className="px-1 text-[10px] text-muted">
                    Destination {index + 1}
                  </legend>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        className="accent-brand"
                        checked={hook.enabled}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            webhooks: draft.webhooks.map((entry) =>
                              entry.id === hook.id
                                ? { ...entry, enabled: event.target.checked }
                                : entry,
                            ),
                          })
                        }
                      />
                      Enabled
                    </label>
                    <button
                      type="button"
                      className="icon-btn !h-8 !w-8"
                      aria-label={`Remove webhook ${index + 1}`}
                      onClick={() =>
                        setDraft({
                          ...draft,
                          webhooks: draft.webhooks.filter(
                            (entry) => entry.id !== hook.id,
                          ),
                        })
                      }
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <label className="block text-xs">
                    Label or destination name
                    <input
                      className="field mt-1.5"
                      maxLength={100}
                      placeholder="Your label operations"
                      value={hook.label}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          webhooks: draft.webhooks.map((entry) =>
                            entry.id === hook.id
                              ? { ...entry, label: event.target.value }
                              : entry,
                          ),
                        })
                      }
                    />
                  </label>
                  <label className="block text-xs">
                    Payload format
                    <select
                      className="field mt-1.5"
                      value={hook.kind}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          webhooks: draft.webhooks.map((entry) =>
                            entry.id === hook.id
                              ? {
                                  ...entry,
                                  kind: event.target.value as typeof hook.kind,
                                }
                              : entry,
                          ),
                        })
                      }
                    >
                      <option value="json">
                        Signed event JSON · internal backend
                      </option>
                      <option value="discord">Discord webhook</option>
                      <option value="telegram">Telegram relay</option>
                    </select>
                  </label>
                  <label className="block text-xs">
                    Webhook HTTPS URL
                    <input
                      className="field mt-1.5 !text-xs"
                      type="url"
                      placeholder="https://hooks.your-label.com/airplay"
                      maxLength={2048}
                      value={hook.url}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          webhooks: draft.webhooks.map((entry) =>
                            entry.id === hook.id
                              ? { ...entry, url: event.target.value }
                              : entry,
                          ),
                        })
                      }
                    />
                  </label>
                </fieldset>
              ))}
              <button
                type="button"
                className="btn btn-ghost !text-xs"
                disabled={draft.webhooks.length >= 10}
                onClick={() =>
                  setDraft({
                    ...draft,
                    webhooks: [
                      ...draft.webhooks,
                      {
                        id: `hook-${crypto.randomUUID()}`,
                        label: "",
                        url: "",
                        kind: "json",
                        enabled: true,
                      },
                    ],
                  })
                }
              >
                <Plus size={14} />
                Add webhook destination
              </button>
              <p className="flex gap-2 rounded-xl bg-surface-2 p-3 text-[11px] leading-relaxed text-muted">
                <ShieldCheck size={16} className="shrink-0 text-brand" />
                Live dispatch requires an exact server-side endpoint allowlist.
                DNS/IP checks block private networks; requests do not follow
                redirects. JSON requests carry an HMAC signature and an
                idempotency key.
              </p>
            </div>
          )}
        </div>
        {errors.length > 0 && (
          <div
            role="alert"
            className="mt-4 rounded-xl border border-red-300 bg-red-50 p-3 text-xs text-red-800"
          >
            <p className="font-semibold">Review these settings</p>
            <ul className="mt-1 list-disc space-y-1 pl-4">
              {errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <span className="flex items-center gap-1.5 text-[10px] text-muted">
            <ShieldCheck size={12} />
            Local configuration · not provider verification
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              className="btn btn-ghost !text-xs"
              onClick={onClose}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary !text-xs">
              <Check size={14} />
              Save channel settings
            </button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}

/** Header shortcut is available in every workspace, without navigating away or losing a staged master. */
export function NotificationSettingsLauncher() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="icon-btn relative"
        aria-label="Configure Airplay Alerts & Webhooks"
        onClick={() => setOpen(true)}
      >
        <Bell size={17} />
      </button>
      {open && <NotificationConfigDialog onClose={() => setOpen(false)} />}
    </>
  );
}
