import type { Metadata } from "next";
import Link from "next/link";
import { ReadinessBoard } from "@/components/setup/ReadinessBoard";
import { buildReadiness, httpFetcher } from "@/lib/health";
import { SITE_URL, SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase/config";

/** Never cached: this page exists to report the state of *this* deployment. */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Setup & health",
  description: "Live wiring status for this East Sound deployment.",
  robots: { index: false, follow: false },
};

export default async function SetupPage() {
  const report = await buildReadiness({
    supabaseUrl: SUPABASE_URL,
    anonKey: SUPABASE_ANON_KEY,
    siteUrl: SITE_URL,
    fetch: httpFetcher,
  });

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl">
        <nav className="mb-8 flex items-center justify-between text-sm">
          <Link href="/" className="font-semibold text-emerald-400 hover:text-emerald-300">
            ← East Sound
          </Link>
          <span className="font-mono text-xs text-slate-500">/setup</span>
        </nav>
        <ReadinessBoard report={report} />
      </div>
    </main>
  );
}
