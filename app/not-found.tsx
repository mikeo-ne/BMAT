import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="font-mono text-sm text-emerald-400">404 · no signal</p>
      <h1 className="text-2xl font-bold text-white">This frequency is silent.</h1>
      <Link href="/" className="btn-primary">Back to East Sound</Link>
    </main>
  );
}
