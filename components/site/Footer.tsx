import Link from "next/link";
import { Logo } from "./Logo";

export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-slate-800/80">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div>
          <Logo />
          <p className="mt-3 text-xs text-slate-500">East Sound Technologies is a product of 7H Music Group Ltd · Kampala, Uganda</p>
          <p className="mt-1 text-xs text-slate-500">© {year} 7H Music Group Ltd. All rights reserved.</p>
        </div>
        <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-400">
          <Link href="/#charts" className="hover:text-white">Charts</Link>
          <Link href="/coverage" className="hover:text-white">Coverage</Link>
          <Link href="/pricing" className="hover:text-white">Pricing</Link>
          <Link href="/blog" className="hover:text-white">Blog</Link>
          <Link href="/#use-cases" className="hover:text-white">Use cases</Link>
          <Link href="/legal/terms" className="hover:text-white">Terms</Link>
          <Link href="/legal/privacy" className="hover:text-white">Privacy</Link>
        </nav>
      </div>
    </footer>
  );
}
