"use client";

import { useMemo, useState } from "react";

import { FM_STATIONS } from "@/lib/regions";
import type { AdCampaign, ContractTerms } from "@/lib/advertising";

interface CampaignFormProps {
  onCreate: (campaign: AdCampaign) => void;
  /** Ids already in use, so a new campaign gets a unique one. */
  nextId: string;
}

interface DraftTerms {
  brand: string;
  product: string;
  stationId: string;
  playsPerDay: string;
  windowStartHour: string;
  windowEndHour: string;
  days: string;
}

const BLANK: DraftTerms = {
  brand: "",
  product: "",
  stationId: "capital-kla",
  playsPerDay: "5",
  windowStartHour: "6",
  windowEndHour: "10",
  days: "14",
};

const MAX_JINGLE_BYTES = 12 * 1024 * 1024;

/** Assumed spot length until the jingle is actually probed. */
const DEFAULT_JINGLE_SEC = 30;

export function CampaignForm({ onCreate, nextId }: CampaignFormProps) {
  const [draft, setDraft] = useState<DraftTerms>(BLANK);
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const stations = useMemo(
    () => [...FM_STATIONS].sort((a, b) => a.name.localeCompare(b.name)),
    [],
  );

  const set = (key: keyof DraftTerms) => (value: string) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  function handleFile(next: File | null) {
    setErrors((prev) => ({ ...prev, file: "" }));

    if (!next) {
      setFile(null);
      return;
    }

    const isMp3 = next.type === "audio/mpeg" || /\.mp3$/i.test(next.name);
    if (!isMp3) {
      setErrors((prev) => ({ ...prev, file: "Ad jingles are accepted as MP3 only." }));
      setFile(null);
      return;
    }
    if (next.size > MAX_JINGLE_BYTES) {
      setErrors((prev) => ({ ...prev, file: "Keep the jingle under 12 MB." }));
      setFile(null);
      return;
    }

    setFile(next);
  }

  function validate(): { ok: boolean; terms?: ContractTerms; jingle?: AdCampaign["jingle"] } {
    const next: Record<string, string> = {};

    const plays = Number(draft.playsPerDay);
    const startHour = Number(draft.windowStartHour);
    const endHour = Number(draft.windowEndHour);
    const days = Number(draft.days);

    if (!draft.brand.trim()) next.brand = "Name the advertiser.";
    if (!draft.product.trim()) next.product = "Name the product or campaign.";
    if (!file) next.file = "Attach the ad jingle as an MP3.";
    if (!Number.isInteger(plays) || plays < 1 || plays > 12) {
      next.playsPerDay = "Between 1 and 12 spots a day.";
    }
    if (!Number.isInteger(startHour) || startHour < 0 || startHour > 23) {
      next.windowStartHour = "Use an hour from 0 to 23.";
    }
    if (!Number.isInteger(endHour) || endHour < 1 || endHour > 24) {
      next.windowEndHour = "Use an hour from 1 to 24.";
    }
    if (Number.isInteger(startHour) && Number.isInteger(endHour) && endHour <= startHour) {
      next.windowEndHour = "The window has to close after it opens.";
    }
    if (!Number.isInteger(days) || days < 1 || days > 90) {
      next.days = "Contracts run from 1 to 90 days.";
    }

    setErrors(next);
    if (Object.keys(next).length > 0 || !file) return { ok: false };

    return {
      ok: true,
      terms: {
        stationId: draft.stationId,
        playsPerDay: plays,
        windowStartHour: startHour,
        windowEndHour: endHour,
        days,
      },
      jingle: {
        fileName: file.name,
        sizeBytes: file.size,
        durationSec: DEFAULT_JINGLE_SEC,
      },
    };
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const result = validate();
    if (!result.ok || !result.terms || !result.jingle) return;

    const startsOn = new Date().toISOString().slice(0, 10);

    onCreate({
      id: nextId,
      brand: draft.brand.trim(),
      product: draft.product.trim(),
      agency: "Direct booking",
      jingle: result.jingle,
      terms: result.terms,
      startsOn,
    });

    setDraft(BLANK);
    setFile(null);
    setErrors({});
  }

  const field = (key: keyof DraftTerms) => ({
    value: draft[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => set(key)(e.target.value),
    "aria-invalid": errors[key] ? true : undefined,
  });

  return (
    <section className="panel p-4" aria-labelledby="campaign-form-heading">
      <h2 id="campaign-form-heading" className="text-sm font-semibold tracking-tight">
        Create campaign
      </h2>
      <p className="mt-1 text-xs leading-relaxed text-muted">
        Upload the jingle and set the contracted airtime. BMAT audits every booked spot against
        fingerprinted playout and reports the gap.
      </p>

      <form className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2" onSubmit={handleSubmit} noValidate>
        <label className="field sm:col-span-2">
          <span className="label">Advertiser</span>
          <input className="field" placeholder="Nile Breweries" {...field("brand")} />
          {errors.brand ? <span className="text-[11px] text-brand">{errors.brand}</span> : null}
        </label>

        <label className="field sm:col-span-2">
          <span className="label">Product or campaign</span>
          <input className="field" placeholder="Nile Special — drive time" {...field("product")} />
          {errors.product ? <span className="text-[11px] text-brand">{errors.product}</span> : null}
        </label>

        <label className="field">
          <span className="label">Station</span>
          <select className="field" {...field("stationId")}>
            {stations.map((station) => (
              <option key={station.id} value={station.id}>
                {station.name} · {station.frequency} · {station.location}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span className="label">Spots per day</span>
          <input className="field" type="number" min={1} max={12} {...field("playsPerDay")} />
          {errors.playsPerDay ? (
            <span className="text-[11px] text-brand">{errors.playsPerDay}</span>
          ) : null}
        </label>

        <label className="field">
          <span className="label">Window opens (EAT)</span>
          <input className="field" type="number" min={0} max={23} {...field("windowStartHour")} />
          {errors.windowStartHour ? (
            <span className="text-[11px] text-brand">{errors.windowStartHour}</span>
          ) : null}
        </label>

        <label className="field">
          <span className="label">Window closes (EAT)</span>
          <input className="field" type="number" min={1} max={24} {...field("windowEndHour")} />
          {errors.windowEndHour ? (
            <span className="text-[11px] text-brand">{errors.windowEndHour}</span>
          ) : null}
        </label>

        <label className="field">
          <span className="label">Flight length (days)</span>
          <input className="field" type="number" min={1} max={90} {...field("days")} />
          {errors.days ? <span className="text-[11px] text-brand">{errors.days}</span> : null}
        </label>

        <label className="field">
          <span className="label">Ad jingle (MP3)</span>
          <input
            className="field"
            type="file"
            accept="audio/mpeg,.mp3"
            onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
            aria-invalid={errors.file ? true : undefined}
          />
          {file ? (
            <span className="text-[11px] text-muted">
              {file.name} · {(file.size / 1024).toFixed(0)} KB
            </span>
          ) : null}
          {errors.file ? <span className="text-[11px] text-brand">{errors.file}</span> : null}
        </label>

        <div className="flex items-center gap-3 sm:col-span-2">
          <button type="submit" className="btn btn-primary">
            Book campaign
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setDraft(BLANK);
              setFile(null);
              setErrors({});
            }}
          >
            Reset
          </button>
        </div>
      </form>
    </section>
  );
}
