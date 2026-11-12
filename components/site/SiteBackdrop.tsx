"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/**
 * Site-wide 3D background: a slow ocean of glowing points rolling like a sound
 * wave, seen in perspective. The camera drifts with scrolling and leans toward
 * the pointer. Sits behind every public page (not the dashboards).
 *
 * Light by design: plain canvas, fewer points and 30 fps on phones, stops when
 * the tab is hidden, and a single still frame for reduced-motion settings.
 */
export function SiteBackdrop() {
  const path = usePathname() ?? "/";
  const off = path.startsWith("/dashboard") || path.startsWith("/setup") || path.startsWith("/auth");
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (off) return;
    const el = canvas.current;
    const ctx = el?.getContext("2d");
    if (!el || !ctx) return;
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const small = window.matchMedia?.("(max-width: 640px)").matches ?? false;
    const COLS = small ? 44 : 90, ROWS = small ? 30 : 50;
    const minGap = small ? 33 : 16; // ~30 fps on phones, ~60 on desktop

    let w = 0, h = 0, raf = 0, last = 0;
    const look = { x: 0, y: 0, tx: 0, ty: 0 };
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, small ? 1.5 : 2);
      w = window.innerWidth; h = window.innerHeight;
      el.width = Math.floor(w * dpr); el.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (still) draw(0);
    };

    function draw(t: number) {
      look.x += (look.tx - look.x) * 0.04;
      look.y += (look.ty - look.y) * 0.04;
      const scroll = Math.min(1, window.scrollY / Math.max(1, document.body.scrollHeight - h));
      const yaw = look.x * 0.18 + Math.sin(t * 0.00005) * 0.12;
      const pitch = 0.32 + scroll * 0.35 + look.y * 0.08;
      const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
      const k = Math.max(w, h) * 0.9;
      ctx!.clearRect(0, 0, w, h);
      for (let j = 0; j < ROWS; j++) {
        const z = (j / (ROWS - 1)) * 3.6 - 1.2; // near → far
        for (let i = 0; i < COLS; i++) {
          const x = (i / (COLS - 1)) * 3.2 - 1.6;
          const y = 0.09 * Math.sin(x * 2.2 + t * 0.0007) * Math.cos(z * 1.8 - t * 0.0005)
                  + 0.05 * Math.sin((x + z) * 3.1 - t * 0.0011) - 0.75;
          const x1 = x * cy - z * sy, z1 = x * sy + z * cy;
          const y2 = y * cp - z1 * sp, z2 = y * sp + z1 * cp + 2.2;
          if (z2 <= 0.2) continue;
          const sx = w / 2 + (x1 * k) / z2, syy = h * 0.3 - (y2 * k) / z2;
          if (sx < -4 || sx > w + 4 || syy < -4 || syy > h + 4) continue;
          const crest = Math.min(1, Math.max(0, (y + 0.83) * 5));
          const a = Math.min(0.8, (0.22 + crest * 0.6) * Math.min(1, 3.6 / z2));
          const r = Math.max(0.9, (3.2 / z2) * (0.7 + crest));
          ctx!.fillStyle = `rgba(${52 + Math.round(70 * crest)},${211 + Math.round(20 * crest)},${153 + Math.round(40 * crest)},${a})`;
          ctx!.fillRect(sx - r / 2, syy - r / 2, r, r);
        }
      }
    }

    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      if (t - last < minGap) return;
      last = t;
      draw(t);
    };
    const onPointer = (e: PointerEvent) => {
      look.tx = (e.clientX / Math.max(1, w)) * 2 - 1;
      look.ty = (e.clientY / Math.max(1, h)) * 2 - 1;
    };
    const onVis = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden && !still) raf = requestAnimationFrame(loop);
    };

    resize();
    window.addEventListener("resize", resize);
    if (!still) {
      window.addEventListener("pointermove", onPointer, { passive: true });
      document.addEventListener("visibilitychange", onVis);
      raf = requestAnimationFrame(loop);
    }
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointer);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [off]);

  if (off) return null;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
      <canvas ref={canvas} className="h-full w-full" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,transparent_30%,rgba(2,6,23,0.55)_100%)]" />
    </div>
  );
}
