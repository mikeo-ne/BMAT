import Link from "next/link";
import { Logo } from "./Logo";

export function Footer() {
  return (
    <footer className="border-t border-slate-800/80">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div>
          <Logo />
          <p className="mt-3 text-xs text-slate-500">East Sound Technologies is a product of 7H Music Group Ltd · Kampala, Uganda</p>
        </div>
        <nav className="flex gap-6 text-sm text-slate-400">
          <Link href="/#charts" className="hover:text-white">Charts</Link>
          <Link href="/blog" className="hover:text-white">Blog</Link>
          <Link href="/#use-cases" className="hover:text-white">Use cases</Link>
        </nav>
      </div>
    </footer>
  );
}
