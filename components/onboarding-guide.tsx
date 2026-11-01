"use client";

import { useState } from "react";
import {
  ArrowRight,
  AudioLines,
  BookOpen,
  Fingerprint,
  ShieldCheck,
} from "lucide-react";
import { Dialog } from "@/components/dialog";
import { GLOSSARY } from "@/components/help-tip";

const STEPS = [
  {
    icon: Fingerprint,
    title: "One song. Two identifiers.",
    text: "Start with the right metadata. It is how an airplay match finds the right recording and the right people.",
    topics: ["isrc", "iswc"] as const,
  },
  {
    icon: ShieldCheck,
    title: "Agree the rights before delivery.",
    text: "Master ownership, public performance and mechanical rights are separate. Each pool must total 100%, with an approval from every collaborator.",
    topics: ["master", "performance", "mechanical"] as const,
  },
  {
    icon: AudioLines,
    title: "Follow every spin, with context.",
    text: "Choose a workspace, explore Uganda’s regions, and inspect a captured playout record. Public releases are not proof of airplay or ownership. Station capture and notification providers must be connected separately.",
    topics: ["isrcAllocation", "weighting"] as const,
  },
];

export function OnboardingGuide({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const current = STEPS[step];
  const Icon = current.icon;
  return (
    <>
      <button
        type="button"
        className={compact ? "icon-btn" : "btn btn-ghost"}
        aria-label="Open the quick-start guide"
        onClick={() => {
          setStep(0);
          setOpen(true);
        }}
      >
        <BookOpen size={16} />
        {!compact && "Quick guide"}
      </button>
      {open && (
        <Dialog
          title="A little context. A clearer picture."
          onClose={() => setOpen(false)}
        >
          <div
            className="mb-5 flex items-center gap-2"
            aria-label={`Step ${step + 1} of ${STEPS.length}`}
          >
            {STEPS.map((_, index) => (
              <span
                key={index}
                className={`h-1 flex-1 rounded-full ${index <= step ? "bg-brand" : "bg-line"}`}
              />
            ))}
          </div>
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand/10 text-brand">
            <Icon size={24} />
          </div>
          <p className="eyebrow">
            THE ESSENTIALS · {step + 1} / {STEPS.length}
          </p>
          <h3 className="mt-2 text-xl font-semibold tracking-tight">
            {current.title}
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            {current.text}
          </p>
          <dl className="mt-5 space-y-3">
            {current.topics.map((topic) => (
              <div
                key={topic}
                className="rounded-xl border border-line bg-surface-2/50 p-3.5"
              >
                <dt className="text-xs font-semibold">
                  {GLOSSARY[topic].term}
                </dt>
                <dd className="mt-1 text-xs leading-relaxed text-muted">
                  {GLOSSARY[topic].text}
                </dd>
              </div>
            ))}
          </dl>
          <div className="mt-6 flex flex-wrap justify-between gap-3">
            <button
              type="button"
              className="btn btn-ghost"
              disabled={step === 0}
              onClick={() => setStep((value) => value - 1)}
            >
              Back
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() =>
                step === STEPS.length - 1
                  ? setOpen(false)
                  : setStep((value) => value + 1)
              }
            >
              {step === STEPS.length - 1 ? "Ready to explore" : "Next"}
              <ArrowRight size={15} />
            </button>
          </div>
        </Dialog>
      )}
    </>
  );
}
