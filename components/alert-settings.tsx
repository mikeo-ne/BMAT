"use client";

import { CHANNELS, toggleChannel, type AlertRule, type ChannelId } from "@/lib/alerts";

interface AlertSettingsProps {
  rules: AlertRule[];
  onToggleRule: (ruleId: string) => void;
  onToggleChannel: (ruleId: string, channel: ChannelId) => void;
}

/**
 * Notification triggers.
 *
 * One row per watched track or station, with a channel toggle on each. A rule
 * with no channels selected stays enabled but fires nowhere, which is how an
 * operator mutes a single record without deleting the subscription.
 */
export function AlertSettings({ rules, onToggleRule, onToggleChannel }: AlertSettingsProps) {
  const trackRules = rules.filter((r) => r.targetType === "track");
  const stationRules = rules.filter((r) => r.targetType === "station");

  const renderGroup = (title: string, group: AlertRule[], hint: string) => (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">{title}</h3>
      <p className="mt-0.5 text-[11px] text-muted">{hint}</p>

      <ul className="mt-2 space-y-2">
        {group.map((rule) => (
          <li key={rule.id} className="rounded-lg border border-line bg-surface-2 p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="flex min-w-0 items-center gap-2">
                <input
                  type="checkbox"
                  checked={rule.enabled}
                  onChange={() => onToggleRule(rule.id)}
                  aria-label={`Alerts for ${rule.label}`}
                />
                <span className="truncate text-sm font-medium">{rule.label}</span>
                {rule.verifiedOnly ? (
                  <span className="chip shrink-0 text-muted">verified plays only</span>
                ) : null}
              </label>

              <div className="flex flex-wrap gap-1">
                {CHANNELS.map((channel) => {
                  const active = rule.channels.includes(channel.id);
                  return (
                    <button
                      key={channel.id}
                      type="button"
                      title={channel.hint}
                      aria-pressed={active}
                      aria-label={`${channel.label} alerts for ${rule.label}`}
                      onClick={() => onToggleChannel(rule.id, channel.id)}
                      className={active ? "btn btn-primary" : "btn btn-ghost"}
                    >
                      {channel.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <section className="panel p-4" aria-labelledby="alert-settings-heading">
      <h2 id="alert-settings-heading" className="text-sm font-semibold tracking-tight">
        Notification triggers
      </h2>
      <p className="mt-1 text-xs text-muted">
        Choose where a verified play is pushed. WhatsApp and email go to the rights holder; the
        webhook posts a signed JSON payload to your endpoint.
      </p>

      <div className="mt-4 flex flex-col gap-5">
        {renderGroup("Tracked recordings", trackRules, "Fires on any verified play of the recording.")}
        {renderGroup(
          "Tracked stations",
          stationRules,
          "Fires on any verified play on the station, whatever the recording.",
        )}
      </div>
    </section>
  );
}

/** Channel toggle helper re-exported so the parent does not import from lib twice. */
export { toggleChannel };
