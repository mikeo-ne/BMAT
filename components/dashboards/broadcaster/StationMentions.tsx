"use client";

import { loadStationMentions } from "@/lib/db/broadcaster";
import { useLoad } from "@/lib/db/core";
import { LoadGate, Section } from "@/components/dashboard/ui";
import { MentionsList } from "@/components/dashboard/MentionsList";

/** Broadcaster: brands spoken on its own station(s), read-only. */
export function StationMentions() {
  const state = useLoad(() => loadStationMentions(7));
  return (
    <Section id="mentions" title="Brand Mentions" actions={<span className="text-xs text-slate-500">Spoken on your station · last 7 days</span>}>
      <LoadGate state={state}>
        {(list) => (
          <>
            <MentionsList mentions={list} empty="No brand mentions detected on your station in the last 7 days." />
            <p className="mt-3 text-xs text-slate-500">
              Live reads and on-air shout-outs found by speech recognition. “To review” means the rights auditor hasn&apos;t checked it yet.
            </p>
          </>
        )}
      </LoadGate>
    </Section>
  );
}
