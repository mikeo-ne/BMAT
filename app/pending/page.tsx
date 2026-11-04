import Link from "next/link";
import { Logo } from "@/components/site/Logo";

export default function PendingPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="glass max-w-md p-7">
        <Logo />
        <h1 className="mt-6 text-xl font-bold text-white">Account awaiting verification</h1>
        <p className="mt-3 text-sm text-slate-400">
          CMO / Auditor accounts have universal catalogue access, so East Sound verifies each one before activation.
          You&apos;ll get an email once your workspace is approved.
        </p>
        <Link href="/" className="btn-ghost mt-6">Back to home</Link>
      </div>
    </main>
  );
}
