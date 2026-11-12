"use client";

import { useRef, type ReactNode } from "react";

/** A card that leans toward the pointer in 3D, with a soft light following it. Still on touch and reduced motion. */
export function TiltCard({ children, className = "", id }: { children: ReactNode; className?: string; id?: string }) {
  const ref = useRef<HTMLElement>(null);
  const move = (e: React.PointerEvent) => {
    const el = ref.current;
    if (!el || e.pointerType !== "mouse" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
    el.style.transform = `perspective(700px) rotateX(${(0.5 - py) * 10}deg) rotateY(${(px - 0.5) * 12}deg) translateZ(0)`;
    el.style.setProperty("--mx", `${px * 100}%`);
    el.style.setProperty("--my", `${py * 100}%`);
  };
  const reset = () => {
    if (ref.current) ref.current.style.transform = "";
  };
  return (
    <article ref={ref} id={id} onPointerMove={move} onPointerLeave={reset}
      className={`group relative overflow-hidden transition-transform duration-200 ease-out will-change-transform ${className}`}>
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{ background: "radial-gradient(240px circle at var(--mx,50%) var(--my,50%), rgba(52,211,153,0.16), transparent 70%)" }} />
      <div className="relative">{children}</div>
    </article>
  );
}
