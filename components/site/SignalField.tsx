"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Interactive 3D "airwaves" over Uganda — a field of points shaped like a radio
 * spectrum, with a beacon at each region we monitor. Drag (or swipe) to turn
 * it, move the pointer to send a ripple through the field.
 *
 * Plain canvas + a few lines of perspective maths: no 3D library, so it costs a
 * few KB instead of ~150 KB on a phone data bundle. It pauses when off screen
 * and holds still for people who ask their device for reduced motion.
 */

type Place = { name: string; lat: number; lon: number; hub?: string };

// Real coordinates. Hubs are the four regions the monitoring covers.
const PLACES: Place[] = [
  { name: "Kampala", lat: 0.35, lon: 32.58, hub: "Central" },
  { name: "Mbarara", lat: -0.61, lon: 30.65, hub: "Western" },
  { name: "Mbale", lat: 1.08, lon: 34.18, hub: "Eastern" },
  { name: "Gulu", lat: 2.78, lon: 32.3, hub: "Northern" },
  { name: "Jinja", lat: 0.44, lon: 33.2 },
  { name: "Arua", lat: 3.02, lon: 30.91 },
  { name: "Fort Portal", lat: 0.67, lon: 30.27 },
  { name: "Lira", lat: 2.25, lon: 32.9 },
  { name: "Masaka", lat: -0.33, lon: 31.73 },
  { name: "Soroti", lat: 1.71, lon: 33.61 },
];

const LAT = [-1.6, 4.3];
const LON = [29.5, 35.1];
const COLS = 46;
const ROWS = 34;

// Map lat/lon onto the field: x across (-1..1), z depth (-0.75..0.75).
const toX = (lon: number) => ((lon - LON[0]) / (LON[1] - LON[0])) * 2 - 1;
const toZ = (lat: number) => -(((lat - LAT[0]) / (LAT[1] - LAT[0])) * 1.5 - 0.75);

export function SignalField() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [focus, setFocus] = useState<Place | null>(PLACES[0]);

  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext("2d");
    if (!el || !ctx) return;
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

    let w = 0, h = 0, raf = 0, visible = true;
    let yaw = -0.35, pitch = 0.62, spin = still ? 0 : 0.0009;
    let drag: { x: number; y: number; yaw: number; pitch: number } | null = null;
    const ripple = { x: 0, z: 0, t: -1e9 };
    const pointer = { x: -1, y: -1 };
    let hovered: Place | null = null;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = el.clientWidth; h = el.clientHeight;
      el.width = Math.max(1, Math.floor(w * dpr)); el.height = Math.max(1, Math.floor(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
    ro?.observe(el);
    const io = typeof IntersectionObserver !== "undefined"
      ? new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible && !raf) raf = requestAnimationFrame(frame); })
      : null;
    io?.observe(el);

    const project = (x: number, y: number, z: number) => {
      const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
      const x1 = x * cy - z * sy, z1 = x * sy + z * cy;
      const y2 = y * cp - z1 * sp, z2 = y * sp + z1 * cp;
      const d = 2.4, s = (Math.min(w, h * 2.2) * 1.0) / (d + z2);
      return { sx: w / 2 + x1 * s, sy: h * 0.56 - y2 * s, depth: z2, scale: s };
    };

    const height = (x: number, z: number, t: number) => {
      let y = 0.045 * Math.sin(x * 5 + t * 0.0011) * Math.cos(z * 6 - t * 0.0008);
      for (const p of PLACES) {
        if (!p.hub) continue;
        const dx = x - toX(p.lon), dz = z - toZ(p.lat), r = Math.hypot(dx, dz);
        y += 0.05 * Math.exp(-r * 7) * (1 + Math.sin(r * 30 - t * 0.004));
      }
      const age = (t - ripple.t) / 1000;
      if (age < 2.5) {
        const r = Math.hypot(x - ripple.x, z - ripple.z);
        y += 0.08 * Math.exp(-Math.abs(r - age * 0.9) * 14) * (1 - age / 2.5);
      }
      return y;
    };

    function frame(t: number) {
      raf = 0;
      if (!visible) return;
      if (!drag) yaw += spin;
      ctx!.clearRect(0, 0, w, h);
      const tt = still ? 0 : t;

      // Field of points, back to front.
      for (let j = 0; j < ROWS; j++) {
        for (let i = 0; i < COLS; i++) {
          const x = (i / (COLS - 1)) * 2 - 1, z = (j / (ROWS - 1)) * 1.5 - 0.75;
          const y = height(x, z, tt);
          const p = project(x, y, z);
          const glow = Math.min(1, Math.max(0, 0.25 + y * 7));
          const fade = Math.max(0.15, Math.min(1, 1.3 - (p.depth + 0.8) * 0.45));
          ctx!.fillStyle = `rgba(${Math.round(16 + 94 * glow)},${Math.round(185 + 46 * glow)},${Math.round(129 + 54 * glow)},${(0.35 + 0.65 * glow) * fade})`;
          const r = Math.max(0.8, p.scale * 0.0042 * (1 + glow));
          ctx!.fillRect(p.sx - r / 2, p.sy - r / 2, r, r);
        }
      }

      // Places: towns as small dots, region hubs as beacons with rings.
      hovered = null;
      const labels: { p: Place; sx: number; sy: number }[] = [];
      for (const pl of PLACES) {
        const x = toX(pl.lon), z = toZ(pl.lat);
        const base = project(x, height(x, z, tt), z);
        if (pl.hub) {
          const top = project(x, 0.38, z);
          const g = ctx!.createLinearGradient(base.sx, base.sy, top.sx, top.sy);
          g.addColorStop(0, "rgba(52,211,153,0.9)");
          g.addColorStop(1, "rgba(52,211,153,0)");
          ctx!.strokeStyle = g; ctx!.lineWidth = 2;
          ctx!.beginPath(); ctx!.moveTo(base.sx, base.sy); ctx!.lineTo(top.sx, top.sy); ctx!.stroke();
          for (let k = 0; k < 3; k++) {
            const ph = still ? k / 3 : ((tt / 2400 + k / 3) % 1);
            ctx!.strokeStyle = `rgba(110,231,183,${(1 - ph) * 0.6})`; ctx!.lineWidth = 1;
            ctx!.beginPath();
            for (let a = 0; a <= 24; a++) {
              const an = (a / 24) * Math.PI * 2, rr = 0.02 + ph * 0.16;
              const q = project(x + Math.cos(an) * rr, 0.01, z + Math.sin(an) * rr);
              if (a) ctx!.lineTo(q.sx, q.sy); else ctx!.moveTo(q.sx, q.sy);
            }
            ctx!.stroke();
          }
          ctx!.fillStyle = "#a7f3d0";
          ctx!.beginPath(); ctx!.arc(base.sx, base.sy, 4, 0, Math.PI * 2); ctx!.fill();
        } else {
          ctx!.fillStyle = "rgba(226,232,240,0.85)";
          ctx!.beginPath(); ctx!.arc(base.sx, base.sy, 2.2, 0, Math.PI * 2); ctx!.fill();
        }
        if (Math.hypot(pointer.x - base.sx, pointer.y - base.sy) < 18) hovered = pl;
        labels.push({ p: pl, sx: base.sx, sy: base.sy });
      }
      ctx!.font = "600 11px ui-sans-serif, system-ui, sans-serif";
      ctx!.textAlign = "center";
      for (const l of labels) {
        const on = l.p === hovered;
        if (!l.p.hub && !on) continue;
        ctx!.fillStyle = on ? "#ffffff" : "rgba(209,250,229,0.9)";
        ctx!.fillText(l.p.hub ? `${l.p.name} · ${l.p.hub}` : l.p.name, l.sx, l.sy - (l.p.hub ? 14 : 9));
      }
      el!.style.cursor = drag ? "grabbing" : hovered ? "pointer" : "grab";
      if (!still || drag) raf = requestAnimationFrame(frame);
    }

    const local = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const down = (e: PointerEvent) => {
      const p = local(e);
      drag = { x: p.x, y: p.y, yaw, pitch };
      el.setPointerCapture(e.pointerId);
      if (hovered) setFocus(hovered);
      // Ripple from roughly where the field was touched.
      ripple.x = (p.x / w) * 2 - 1; ripple.z = ((p.y / h) - 0.55) * 1.5; ripple.t = performance.now();
      if (!raf) raf = requestAnimationFrame(frame);
    };
    const move = (e: PointerEvent) => {
      const p = local(e);
      pointer.x = p.x; pointer.y = p.y;
      if (drag) {
        yaw = drag.yaw + (p.x - drag.x) * 0.008;
        pitch = Math.min(1.2, Math.max(0.25, drag.pitch + (p.y - drag.y) * 0.004));
        if (!raf) raf = requestAnimationFrame(frame);
      }
    };
    const up = () => { drag = null; };
    const leave = () => { pointer.x = pointer.y = -1; };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("pointerleave", leave);
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect(); io?.disconnect();
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      el.removeEventListener("pointerleave", leave);
    };
  }, []);

  return (
    <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6" aria-labelledby="airwaves-title">
      <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-emerald-400">The airwaves, live</p>
          <h2 id="airwaves-title" className="mt-2 text-3xl font-bold text-white">Listening across Uganda, every second</h2>
          <p className="mt-3 text-slate-400">
            Each beacon is a region we monitor. Every station there is fingerprinted around the clock, so when your song plays in Gulu at 2 a.m., it&apos;s on your dashboard minutes later.
          </p>
          <div className="mt-5 rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-4" aria-live="polite">
            <p className="font-mono text-[10px] uppercase tracking-widest text-emerald-300/80">{focus?.hub ? `${focus.hub} region` : "Town"}</p>
            <p className="mt-1 text-lg font-semibold text-white">{focus?.name ?? "Tap a beacon"}</p>
            <p className="text-xs text-slate-500">{focus ? `${Math.abs(focus.lat).toFixed(2)}°${focus.lat >= 0 ? "N" : "S"}, ${focus.lon.toFixed(2)}°E` : ""}</p>
          </div>
          <p className="mt-3 text-xs text-slate-500">Drag to turn the map · tap a point to send a signal.</p>
        </div>
        <div className="relative">
          <div aria-hidden className="pointer-events-none absolute inset-0 rounded-3xl bg-[radial-gradient(ellipse_at_center,rgba(16,185,129,0.14),transparent_70%)]" />
          <canvas ref={canvas} className="relative h-[340px] w-full touch-pan-y select-none sm:h-[440px]"
            role="img" aria-label="Animated 3D map of Uganda with beacons at Kampala, Mbarara, Mbale and Gulu, the four monitored regions" />
        </div>
      </div>
    </section>
  );
}
