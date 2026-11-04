import Link from "next/link";

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="group flex items-center gap-2.5" aria-label="East Sound Technologies home">
      <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden className="drop-shadow-[0_0_10px_rgba(52,211,153,0.55)]">
        <rect width="32" height="32" rx="9" fill="#022c22" />
        {[6, 10, 14, 18, 22, 26].map((x, i) => (
          <rect key={x} x={x - 1} y={16 - [4, 8, 11, 7, 10, 5][i]} width="2" height={[4, 8, 11, 7, 10, 5][i] * 2} rx="1" fill="#34d399" />
        ))}
      </svg>
      {!compact && (
        <span className="leading-none">
          <span className="block text-[15px] font-bold tracking-tight text-white">East Sound</span>
          <span className="block text-[10px] font-medium uppercase tracking-[0.2em] text-emerald-400/80">Technologies</span>
        </span>
      )}
    </Link>
  );
}
