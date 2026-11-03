"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { CircleHelp } from "lucide-react";

export const GLOSSARY = {
  isrc: {
    term: "ISRC",
    text: "The International Standard Recording Code identifies one specific sound recording. A new mix or recording may need a different ISRC. An ISRC does not identify the underlying song or prove ownership.",
  },
  iswc: {
    term: "ISWC",
    text: "The International Standard Musical Work Code identifies the underlying composition, not the recording. Several recordings (ISRCs) can use one composition (ISWC). A rights society assigns an ISWC; East Sound does not issue one.",
  },
  performance: {
    term: "Performance rights",
    text: "Rights in the public performance or broadcast of a composition. Writers and publishers agree how this separate 100% pool is shared. A broadcast report is not itself a licence or proof of ownership.",
  },
  mechanical: {
    term: "Mechanical splits",
    text: "Shares of the composition’s reproduction rights, such as copies and qualifying digital uses. These form their own 100% pool and need not match master ownership or performance shares. A radio spin alone does not establish a mechanical payment.",
  },
  master: {
    term: "Master ownership",
    text: "Ownership of this specific sound recording. Artists, labels and producers can agree shares totalling 100%. Master ownership is separate from songwriting, performance and mechanical rights.",
  },
  isrcAllocation: {
    term: "ISRC allocation",
    text: "East Sound reserves unique, local UG-ESD-YY-XXXXX demo tags. These are not official IFPI registrations. Use your authorised registrant code and retain an existing ISRC when re-delivering the same recording.",
  },
  weighting: {
    term: "Time-of-day weighting",
    text: "An illustrative multiplier applied to a base per-play rate. Prime, standard and night bands use East Africa Time. These rates and multipliers are demo policy, not the published UPRS tariff.",
  },
  reportal: {
    term: "UPRS cue sheets",
    text: "A broadcast cue sheet lists every captured play for a station and reporting period with its EAT timestamp and daypart. Reportal generates XLSX and PDF exports from authenticated playout records; unmatched audio keeps a blank ISRC.",
  },
} as const;

export function HelpTip({ topic }: { topic: keyof typeof GLOSSARY }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<CSSProperties>({});
  const buttonRef = useRef<HTMLButtonElement>(null);
  const tooltipRef = useRef<HTMLSpanElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const id = useId();
  const item = GLOSSARY[topic];

  const updatePosition = useCallback(() => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(256, window.innerWidth - 32);
    const below = rect.top < 230;
    setPosition({
      width,
      left: Math.max(
        16,
        Math.min(rect.right - width, window.innerWidth - width - 16),
      ),
      ...(below
        ? { top: rect.bottom + 8 }
        : { bottom: window.innerHeight - rect.top + 8 }),
      maxHeight: Math.max(
        80,
        below ? window.innerHeight - rect.bottom - 24 : rect.top - 24,
      ),
    });
  }, []);

  function show() {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    updatePosition();
    setOpen(true);
  }

  useEffect(
    () => () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    },
    [],
  );
  useEffect(() => {
    if (!open) return;
    const reposition = (event: Event) => {
      if (
        !(event.target instanceof Node) ||
        !tooltipRef.current?.contains(event.target)
      )
        updatePosition();
    };
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open, updatePosition]);

  return (
    <span
      className="inline-flex align-middle"
      onMouseEnter={show}
      onMouseLeave={() => {
        hideTimer.current = setTimeout(() => {
          if (document.activeElement !== buttonRef.current) setOpen(false);
        }, 180);
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        aria-label={`What is ${item.term}?`}
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        onFocus={show}
        onBlur={() => setOpen(false)}
        onClick={show}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            setOpen(false);
          }
        }}
        className="inline-flex h-6 w-6 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-brand"
      >
        <CircleHelp size={13} />
      </button>
      {open && (
        <span
          ref={tooltipRef}
          id={id}
          role="tooltip"
          style={position}
          className="fixed z-50 overflow-y-auto rounded-xl border border-line bg-surface p-3 text-left text-xs font-normal normal-case leading-relaxed tracking-normal text-muted shadow-xl"
        >
          <strong className="mb-1 block text-foreground">{item.term}</strong>
          {item.text}
        </span>
      )}
    </span>
  );
}
