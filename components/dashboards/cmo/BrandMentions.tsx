"use client";

import { useState, type FormEvent } from "react";
import { addTrackedBrand, loadMentions, reviewMention, setBrandActive } from "@/lib/db/cmo";
import { useLoad } from "@/lib/db/core";
import { aliasToLearn, parseTerms, type Mention, type MentionStatus } from "@/lib/mentions";
import { safeArray } from "@/lib/safe";
import { LoadGate, SaveNote, Section, Toggle } from "@/components/dashboard/ui";
import { MentionsList } from "@/components/dashboard/MentionsList";

type Save = { kind: "idle" | "saving" | "saved" | "error"; msg?: string };

/** CMO: brands spoken on air across every station, with review + the tracked-brand list. */
export function BrandMentions() {
  const state = useLoad(() => loadMentions(7));
  const [filter, setFilter] = useState<"all" | "unreviewed">("unreviewed");
  const [err, setErr] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [terms, setTerms] = useState("");
  const [save, setSave] = useState<Save>({ kind: "idle" });

  const review = async (m: Mention, status: MentionStatus) => {
    setErr(null);
    const brands = safeArray(state.data?.brands);
    const brand = brands.find((b) => b.brand === m.brand);
    const alias = status === "confirmed" ? aliasToLearn(m, brand) : null;
    try {
      await reviewMention(m.id, status, alias && brand ? { brandId: brand.id, alias, aliases: brand.aliases } : undefined);
      state.reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't save the review.");
    }
  };

  const add = async (e: FormEvent) => {
    e.preventDefault();
    const forms = parseTerms(terms || name);
    setSave({ kind: "saving" });
    try {
      await addTrackedBrand(name, forms);
      setName("");
      setTerms("");
      setSave({ kind: "saved" });
      state.reload();
    } catch (e) {
      setSave({ kind: "error", msg: e instanceof Error ? e.message : undefined });
    }
  };

  return (
    <Section id="mentions" title="Brand Mentions" actions={<span className="text-xs text-slate-500">Spoken on air · last 7 days</span>}>
      <LoadGate state={state}>
        {(d) => {
          const shown = filter === "all" ? d.mentions : d.mentions.filter((m) => m.status === "unreviewed");
          return (
            <div className="grid gap-8 lg:grid-cols-[1fr_300px]">
              <div>
                <div className="mb-3 flex gap-2">
                  {(["unreviewed", "all"] as const).map((f) => (
                    <button key={f} type="button" onClick={() => setFilter(f)} className={`pill ${filter === f ? "pill-on" : "pill-off"}`}>
                      {f === "unreviewed" ? `To review (${d.mentions.filter((m) => m.status === "unreviewed").length})` : `All (${d.mentions.length})`}
                    </button>
                  ))}
                </div>
                {err && <p role="alert" className="mb-3 text-sm text-rose-300">{err}</p>}
                <MentionsList mentions={shown} empty={filter === "unreviewed" ? "Nothing waiting for review." : "No brand mentions in the last 7 days."}
                  actions={(m) => m.status === "unreviewed" ? (
                    <span className="flex gap-2">
                      <button type="button" className="btn-primary !px-3 !py-1 text-xs" onClick={() => review(m, "confirmed")}>Confirm</button>
                      <button type="button" className="btn-ghost !px-3 !py-1 text-xs" onClick={() => review(m, "rejected")}>Not a mention</button>
                    </span>
                  ) : null} />
                <p className="mt-3 text-xs text-slate-500">
                  Found by speech recognition, so check each one: play the clip, then confirm or reject. Confirming a misheard spelling
                  teaches it to the system for next time.
                </p>
              </div>

              <div>
                <h3 className="mb-2 text-sm font-semibold text-white">Brands we listen for</h3>
                <form onSubmit={add} className="mb-4 space-y-2">
                  <input className="input !py-2" placeholder="Brand, e.g. Mukwano" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} aria-label="Brand name" />
                  <input className="input !py-2" placeholder="How it's said (comma separated)" value={terms} onChange={(e) => setTerms(e.target.value)} aria-label="Spoken forms" />
                  <div className="flex items-center gap-2">
                    <button className="btn-primary !py-1.5 text-xs" disabled={!name.trim() || save.kind === "saving"}>+ Track brand</button>
                    <SaveNote state={save} />
                  </div>
                </form>
                <div className="divide-y divide-slate-800">
                  {safeArray(d.brands).map((b) => (
                    <div key={b.id}>
                      <Toggle label={b.brand} description={[...b.terms, ...b.aliases.map((a) => `heard as “${a}”`)].join(" · ")}
                        checked={b.active} onChange={async (v) => {
                          try { await setBrandActive(b.id, v); state.reload(); } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't save."); }
                        }} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        }}
      </LoadGate>
    </Section>
  );
}
