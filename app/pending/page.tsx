import Link from "next/link";
import { Logo } from "@/components/site/Logo";

export default function PendingPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="glass max-w-md p-7">
        <Logo />
        <h1 className="mt-6 text-xl font-bold text-white">Account awaiting verification</h1>
        <p className="mt-3 text-sm text-slate-400">
          CMO / Auditor accounts have universal catalogue access, so East Sound verifies each one before
          activation. Approval is manual — a person checks the account, usually the same working day.
        </p>
        <p className="mt-3 text-sm text-slate-400">
          Signed up as a <span className="text-white">broadcaster</span> by mistake? Broadcasters are approved
          instantly and can connect their own station from the dashboard — sign out and create the account with
          the Broadcaster role.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/" className="btn-ghost">Back to home</Link>
          <a href="mailto:hello@eastsound.ug?subject=CMO%20account%20approval" className="btn-primary">
            Ask for approval
          </a>
        </div>
      </div>
    </main>
  );
}
