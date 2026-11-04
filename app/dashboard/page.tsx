"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { ROLE_META } from "@/lib/roles";

/** Fallback router (middleware normally redirects before this renders). */
export default function DashboardIndex() {
  const { session, loading } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (loading) return;
    router.replace(session ? ROLE_META[session.role].path : "/?auth=signin");
  }, [loading, session, router]);
  return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Routing to your workspace…</div>;
}
