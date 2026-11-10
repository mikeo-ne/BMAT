import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Offline",
  robots: { index: false, follow: false },
};

/**
 * What the service worker shows when the phone has no signal. Charts are live
 * data, so we say so instead of showing something stale as if it were current.
 */
export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6 py-16">
      <p className="font-mono text-xs uppercase tracking-widest text-emerald-400">Offline</p>
      <h1 className="mt-3 text-3xl font-bold text-white">No connection to East Sound</h1>
      <p className="mt-3 text-slate-400">
        The app is installed and will reopen as soon as you are back online. Airplay numbers are live, so we
        do not show an old chart as if it were current — the monitoring itself keeps running on the server.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link href="/" className="btn-primary">
          Try again
        </Link>
        <Link href="/coverage" className="btn-ghost">
          Coverage
        </Link>
      </div>
      <p className="mt-8 text-xs text-slate-500">
        Alerts still reach you by email, WhatsApp or SMS while the app is offline.
      </p>
    </main>
  );
}
