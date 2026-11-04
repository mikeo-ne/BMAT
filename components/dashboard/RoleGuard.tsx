"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useAuth } from "@/lib/auth-context";
import { ROLE_META, type Role } from "@/lib/roles";

/**
 * Isolation layer 2 (client). Children — and therefore the role's data
 * module — render ONLY when the signed-in role equals `role`. Any mismatch
 * is redirected to the caller's own dashboard before a single row renders.
 */
export function RoleGuard({ role, children }: { role: Role; children: ReactNode }) {
  const { session, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!session) router.replace("/?auth=signin");
    else if (session.role !== role) router.replace(ROLE_META[session.role].path);
  }, [loading, session, role, router]);

  if (loading || !session || session.role !== role) {
    return (
      <div className="flex min-h-screen items-center justify-center" aria-busy="true">
        <div className="flex items-center gap-3 text-sm text-slate-400">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-400 border-t-transparent" />
          Securing your workspace…
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
