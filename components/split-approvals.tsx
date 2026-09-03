"use client";

import { useState } from "react";

import { formatDateTime } from "@/lib/format";
import type { SplitParty } from "@/lib/splits";

interface SplitApprovalsProps {
  parties: SplitParty[];
  title: string;
  isrc: string;
}

/**
 * Who has signed the split sheet.
 *
 * Sign-off is what turns an agreed split into an executable one, so the list
 * shows the channel and the timestamp rather than a bare tick. Reminders are
 * per-party and recorded locally — there is no mail gateway behind them yet.
 */
export function SplitApprovals({ parties, title, isrc }: SplitApprovalsProps) {
  const [reminded, setReminded] = useState<Set<string>>(new Set<string>());

  const signed = parties.filter((p) => p.signedAt !== null);
  const outstanding = parties.filter((p) => p.signedAt === null);

  function remind(partyId: string) {
    setReminded((prev) => new Set(prev).add(partyId));
  }

  return (
    <section className="panel p-4" aria-labelledby="approvals-heading">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="approvals-heading" className="text-sm font-semibold tracking-tight">
            Collaboration approvals
          </h2>
          <p className="mt-1 text-xs text-muted">
            “{title}” · <span className="font-mono">{isrc}</span>
          </p>
        </div>

        <span className="chip">
          {signed.length} of {parties.length} signed
        </span>
      </div>

      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full rounded-full bg-accent"
          style={{ width: `${(signed.length / Math.max(parties.length, 1)) * 100}%` }}
        />
      </div>

      <ul className="mt-4 space-y-2">
        {parties.map((party) => {
          const isSigned = party.signedAt !== null;
          return (
            <li
              key={party.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface-2 p-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{party.name}</p>
                <p className="text-xs text-muted">
                  {party.role} · {party.sharePct}%
                  {party.memberId ? (
                    <>
                      {" "}
                      · <span className="font-mono">{party.memberId}</span>
                    </>
                  ) : null}
                </p>
              </div>

              {isSigned ? (
                <span className="text-right">
                  <span className="chip text-accent">Signed</span>
                  <span className="mt-1 block text-[11px] text-muted">
                    {party.signedAt ? formatDateTime(party.signedAt) : ""}
                    {party.channel ? ` · via ${party.channel}` : ""}
                  </span>
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <span className="chip text-brand">Outstanding</span>
                  <button type="button" className="btn btn-ghost" onClick={() => remind(party.id)}>
                    {reminded.has(party.id) ? "Reminder sent" : "Send reminder"}
                  </button>
                </span>
              )}
            </li>
          );
        })}
      </ul>

      {outstanding.length === 0 ? (
        <p className="mt-3 rounded border border-line bg-surface-2 px-3 py-2 text-xs text-accent">
          Every collaborator has signed. The sheet is executable and can go into the next
          distribution run.
        </p>
      ) : (
        <p className="mt-3 rounded border border-line bg-surface-2 px-3 py-2 text-xs text-muted">
          {outstanding.length} signature{outstanding.length === 1 ? "" : "s"} outstanding. Royalties
          on this recording are held until the sheet is fully executed.
        </p>
      )}
    </section>
  );
}
