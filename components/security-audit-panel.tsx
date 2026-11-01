"use client";
import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { authFetch } from "@/lib/auth-client";
export function SecurityAuditPanel() {
  const [entries, setEntries] = useState<
      | {
          action: string;
          at: string;
          objectKey: string;
          actorId: string | null;
        }[]
      | null
    >(null),
    [error, setError] = useState("");
  useEffect(() => {
    let closed = false;
    void authFetch("/api/audit")
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok)
          throw new Error(body.error ?? "Security audit unavailable.");
        if (!closed) setEntries(body.entries);
      })
      .catch((e) => {
        if (!closed) setError(e.message);
      });
    return () => {
      closed = true;
    };
  }, []);
  return (
    <section className="panel mx-auto mt-6 w-full max-w-[1500px] p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <ShieldCheck size={16} className="text-brand" />
        System-wide account & release audit
      </h2>
      <p className="mt-2 text-[11px] text-muted">
        Session events, immutable agreement creation and account-bound
        approvals. These records do not certify legal identities, rights or UPRS
        affiliation.
      </p>
      {error && (
        <p role="status" className="mt-3 text-xs text-amber-200">
          {error}
        </p>
      )}
      <div className="mt-4 max-h-72 overflow-auto">
        <table className="w-full min-w-[580px] text-left text-[10px]">
          <thead>
            <tr>
              <th className="p-2">UTC timestamp</th>
              <th className="p-2">Action</th>
              <th className="p-2">Actor</th>
              <th className="p-2">Object</th>
            </tr>
          </thead>
          <tbody>
            {entries?.map((entry, i) => (
              <tr key={i} className="border-t border-line">
                <td className="p-2">{entry.at}</td>
                <td className="p-2 text-brand">{entry.action}</td>
                <td className="p-2 font-mono">
                  {entry.actorId ?? "Integration"}
                </td>
                <td className="p-2 font-mono">{entry.objectKey}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {entries?.length === 0 && (
          <p className="p-3 text-xs text-muted">
            No application attestations yet.
          </p>
        )}
      </div>
    </section>
  );
}
