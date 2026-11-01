"use client";
import { useState } from "react";
import { Check, Radio, Sparkles } from "lucide-react";
import { Dialog } from "@/components/dialog";
import { CHANNELS } from "@/lib/alerts";
import {
  parseMilestones,
  subscriptionIssues,
  TRIGGERS,
  type AlertSubscription,
} from "@/lib/notifications";
import { FM_STATIONS, REGIONS } from "@/lib/regions";
import type { Track } from "@/lib/types";

export function NotificationSubscriptionDialog({
  initial,
  catalogue,
  onSave,
  onClose,
}: {
  initial: AlertSubscription;
  catalogue: Track[];
  onSave: (subscription: AlertSubscription) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [milestones, setMilestones] = useState(initial.milestones.join(", "));
  const [errors, setErrors] = useState<string[]>([]);
  function submit() {
    const parsed = parseMilestones(milestones);
    const result = {
      ...draft,
      name: draft.name.trim(),
      milestones: parsed ?? [],
    };
    const issues = subscriptionIssues(result, catalogue);
    if (draft.triggers.includes("milestone") && !parsed)
      issues.push("Separate milestones with commas, e.g. 100, 1000.");
    if (issues.length) {
      setErrors([...new Set(issues)]);
      return;
    }
    onSave(result);
  }
  return (
    <Dialog
      title={
        initial.name ? "Edit airplay subscription" : "New airplay subscription"
      }
      onClose={onClose}
      wide
    >
      <form
        className="space-y-5"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <p className="text-xs leading-relaxed text-muted">
          Subscriptions start at activation. Historical plays inform first-play
          and milestone counters, but are not sent retrospectively. Editing or
          resuming starts a new activation window.
        </p>
        <label className="block text-xs font-medium">
          Subscription name
          <input
            className="field mt-2"
            autoFocus
            maxLength={100}
            placeholder="Release campaign · radio milestones"
            value={draft.name}
            onChange={(event) =>
              setDraft({ ...draft, name: event.target.value })
            }
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-xs font-medium">
            Recording
            <select
              className="field mt-2"
              value={draft.trackId}
              onChange={(event) =>
                setDraft({ ...draft, trackId: event.target.value })
              }
            >
              <option value="all">All catalogue recordings</option>
              {catalogue.map((track) => (
                <option key={track.id} value={track.id}>
                  {track.title} · {track.primaryArtist}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium">
            Station
            <select
              className="field mt-2"
              value={draft.stationId}
              onChange={(event) =>
                setDraft({ ...draft, stationId: event.target.value })
              }
            >
              <option value="all">All FM stations</option>
              {FM_STATIONS.map((station) => (
                <option key={station.id} value={station.id}>
                  {station.name} · {station.location}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="block text-xs font-medium">
          Regional scope
          <select
            className="field mt-2"
            value={draft.region}
            onChange={(event) =>
              setDraft({
                ...draft,
                region: event.target.value as AlertSubscription["region"],
              })
            }
          >
            <option value="All">All Uganda</option>
            {REGIONS.map((region) => (
              <option key={region}>{region}</option>
            ))}
          </select>
        </label>
        <fieldset>
          <legend className="mb-3 flex items-center gap-2 text-xs font-semibold">
            <Sparkles size={14} className="text-brand" />
            Instant triggers
          </legend>
          <div className="space-y-2">
            {TRIGGERS.map((trigger) => (
              <label
                key={trigger.id}
                className={`flex items-start gap-3 rounded-xl border p-3 ${draft.triggers.includes(trigger.id) ? "border-brand/30 bg-brand/5" : "border-line"}`}
              >
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 shrink-0 accent-brand"
                  checked={draft.triggers.includes(trigger.id)}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      triggers: event.target.checked
                        ? [...draft.triggers, trigger.id]
                        : draft.triggers.filter((id) => id !== trigger.id),
                    })
                  }
                />
                <span>
                  <span className="block text-xs font-medium">
                    {trigger.label}
                  </span>
                  <span className="mt-1 block text-[10px] leading-relaxed text-muted">
                    {trigger.hint}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        {draft.triggers.includes("milestone") && (
          <label className="block text-xs font-medium">
            Milestone thresholds
            <input
              className="field mt-2"
              inputMode="numeric"
              placeholder="100, 1000"
              value={milestones}
              onChange={(event) => setMilestones(event.target.value)}
            />
            <span className="mt-1 block text-[10px] text-muted">
              Up to 20 positive whole numbers. Counters span captured FM
              history, not just this screen’s reporting window.
            </span>
          </label>
        )}
        <fieldset>
          <legend className="mb-2 text-xs font-semibold">
            Notification channels
          </legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {CHANNELS.map((channel) => (
              <label
                key={channel.id}
                className="flex items-center gap-2 rounded-xl border border-line p-3 text-xs"
              >
                <input
                  type="checkbox"
                  className="accent-brand"
                  checked={draft.channels.includes(channel.id)}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      channels: event.target.checked
                        ? [...draft.channels, channel.id]
                        : draft.channels.filter((id) => id !== channel.id),
                    })
                  }
                />
                {channel.label}
              </label>
            ))}
          </div>
          <p className="mt-2 text-[10px] leading-relaxed text-muted">
            A channel needs a valid recipient/endpoint and opt-in before this
            subscription counts as active. No messages are sent by saving this
            form.
          </p>
        </fieldset>
        <label className="flex items-center gap-2 text-xs font-medium">
          <input
            type="checkbox"
            role="switch"
            className="h-4 w-4 accent-brand"
            checked={draft.enabled}
            onChange={(event) =>
              setDraft({ ...draft, enabled: event.target.checked })
            }
          />
          Enable this subscription
        </label>
        {errors.length > 0 && (
          <ul
            role="alert"
            className="list-disc rounded-xl border border-red-300 bg-red-50 py-3 pl-7 pr-3 text-xs text-red-800"
          >
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <span className="flex items-center gap-1.5 text-[10px] text-muted">
            <Radio size={12} />
            Captured FM records only · no fabricated plays
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
              Save subscription
            </button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}
