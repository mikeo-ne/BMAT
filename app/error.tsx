"use client";

/** Route-level error boundary: a runtime error shows this panel instead of a white screen. */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="font-mono text-sm text-rose-300">Something interrupted the signal</p>
      <h1 className="text-xl font-bold text-white">This view hit an unexpected error.</h1>
      <p className="max-w-md text-sm text-slate-400">{error?.digest ? `Reference ${error.digest}` : "Try again — your data is safe."}</p>
      <button type="button" onClick={reset} className="btn-primary">Retry</button>
    </main>
  );
}
