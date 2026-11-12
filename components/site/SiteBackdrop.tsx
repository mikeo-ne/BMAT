"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/**
 * Site-wide 3D background: Uganda drawn in glowing points, tilted in space.
 * Radio signals ripple out from towns across the map and travel as arcs to
 * Kampala, where East Sound matches them. The camera drifts slowly, follows the
 * pointer a little and tilts as you scroll. Public pages only (not dashboards).
 *
 * Light by design: plain canvas, fewer points and ~30 fps on phones, stops when
 * the tab is hidden, one still frame for reduced-motion settings.
 *
 * One map, two jobs: when a section marked `data-map-stage` is on screen (the
 * home page's "Listening across Uganda"), the map glides into that box, grows
 * brighter, names the regions and takes drags and taps from it — so the page
 * never shows two maps on top of each other. Messages: the stage sends
 * `eastsound:map-drag` {dx, dy} and `eastsound:map-tap` {x, y}; the map answers
 * `eastsound:map-select` {name, region, lat, lon}.
 *
 * The outline is a simplified trace of Uganda's border (about 30 points), good
 * for a picture, not for measuring.
 */

type LL = [number, number]; // [lon, lat]

const BORDER: LL[] = [
  [30.86, 3.49], [31.25, 3.79], [31.88, 3.56], [32.19, 3.51], [32.69, 3.79], [33.02, 3.89], [33.51, 3.75],
  [33.98, 4.22], [34.38, 3.73], [34.45, 3.18], [34.59, 3.05], [34.83, 2.59], [35.0, 1.9], [34.78, 1.22],
  [34.56, 1.01], [34.16, 0.6], [33.89, 0.11], [33.9, -0.95], [31.87, -1.03], [30.77, -1.01], [30.42, -1.13],
  [29.82, -1.44], [29.58, -1.34], [29.59, -0.59], [29.82, -0.21], [29.88, 0.6], [30.09, 1.06], [30.47, 1.58],
  [30.85, 1.85], [31.17, 2.2], [30.77, 2.34], [30.83, 3.05],
];
// Uganda's share of Lake Victoria, drawn as water.
const LAKE: LL[] = [[31.85, -1.0], [33.9, -1.0], [33.9, 0.1], [33.4, 0.25], [32.7, 0.08], [32.1, -0.05], [31.85, -0.4]];

const TOWNS: { name: string; at: LL; hub?: boolean; region?: string }[] = [
  { name: "Kampala", at: [32.58, 0.35], hub: true, region: "Central" },
  { name: "Gulu", at: [32.3, 2.78], region: "Northern" }, { name: "Mbarara", at: [30.65, -0.61], region: "Western" }, { name: "Mbale", at: [34.18, 1.08], region: "Eastern" },
  { name: "Arua", at: [30.91, 3.02] }, { name: "Fort Portal", at: [30.27, 0.67] }, { name: "Lira", at: [32.9, 2.25] },
  { name: "Jinja", at: [33.2, 0.44] }, { name: "Masaka", at: [31.73, -0.33] }, { name: "Soroti", at: [33.61, 1.71] },
  { name: "Hoima", at: [31.35, 1.43] }, { name: "Kabale", at: [29.99, -1.25] }, { name: "Moroto", at: [34.65, 2.53] },
];

function inside(p: LL, poly: LL[]): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

// Centre of the map and a scale that makes it ~2 units wide.
const C: LL = [32.3, 1.4];
const toXZ = ([lon, lat]: LL) => ({ x: (lon - C[0]) * 0.37, z: -(lat - C[1]) * 0.37 });

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
    const minGap = small ? 33 : 16;

    // Dots inside the border, on a regular grid.
    const step = small ? 0.09 : 0.065;
    const dots: { x: number; z: number; water: boolean; seed: number }[] = [];
    for (let lat = -1.5; lat <= 4.3; lat += step) {
      for (let lon = 29.5; lon <= 35.1; lon += step) {
        const p: LL = [lon, lat];
        if (!inside(p, BORDER)) continue;
        const { x, z } = toXZ(p);
        dots.push({ x, z, water: inside(p, LAKE), seed: Math.sin(lon * 91.3 + lat * 47.9) });
      }
    }
    const towns = TOWNS.map((t) => ({ ...t, ...toXZ(t.at), phase: Math.abs(Math.sin(t.at[0] * 13.7 + t.at[1] * 7.1)) }));
    const hub = towns[0];

    let w = 0, h = 0, raf = 0, last = 0;
    const look = { x: 0, y: 0, tx: 0, ty: 0 };
    const user = { yaw: 0, pitch: 0 }; // from dragging the stage
    let focus = 0; // 0 = background, 1 = sitting in the stage
    const cam = { ox: 0, oy: 0, k: 0, ready: false };
    const blasts: { x: number; z: number; t0: number }[] = [];
    let screen: { name: string; sx: number; sy: number }[] = [];
    let lastT = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, small ? 1.5 : 2);
      w = window.innerWidth; h = window.innerHeight;
      el.width = Math.floor(w * dpr); el.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (still) draw(4000);
    };

    function draw(t: number) {
      look.x += (look.tx - look.x) * 0.05;
      look.y += (look.ty - look.y) * 0.05;
      const scroll = Math.min(1, window.scrollY / Math.max(1, document.body.scrollHeight - h));
      lastT = t;
      // Is the stage on screen? Then the map moves into it.
      const stage = document.querySelector<HTMLElement>("[data-map-stage]");
      const r = stage?.getBoundingClientRect();
      const inView = r && r.width > 0 && r.bottom > h * 0.15 && r.top < h * 0.85;
      focus += ((inView ? 1 : 0) - focus) * 0.06;
      let tox = w * (small ? 0.5 : 0.66), toy = h * (small ? 0.52 : 0.5);
      let tk = Math.min(w * (small ? 1.05 : 0.62), h * 1.05) * 1.15;
      if (inView && r) { tox = r.left + r.width * 0.54; toy = r.top + r.height * 0.55; tk = Math.min(r.width * 1.05, r.height * 1.9); }
      if (!cam.ready) { cam.ox = tox; cam.oy = toy; cam.k = tk; cam.ready = true; }
      const ease = still ? 1 : 0.08;
      cam.ox += (tox - cam.ox) * ease; cam.oy += (toy - cam.oy) * ease; cam.k += (tk - cam.k) * ease;
      const drift = 1 - focus;
      const yaw = -0.35 + Math.sin(t * 0.00006) * 0.18 * drift + look.x * 0.22 * drift + user.yaw;
      const pitch = Math.min(1.35, Math.max(0.35, 0.95 - scroll * 0.3 * drift + look.y * 0.1 * drift + user.pitch));
      const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
      const k = cam.k, ox = cam.ox, oy = cam.oy;
      const P = (x: number, y: number, z: number) => {
        const x1 = x * cy - z * sy, z1 = x * sy + z * cy;
        const y2 = y * cp - z1 * sp, z2 = y * sp + z1 * cp + 3;
        return { sx: ox + (x1 * k) / z2, sy: oy - (y2 * k) / z2, d: z2 };
      };
      ctx!.clearRect(0, 0, w, h);

      // Signal waves: each town pulses on its own beat.
      const waves = towns.map((tw) => ({ x: tw.x, z: tw.z, r: (((t / 3200) + tw.phase) % 1) * 0.9, gain: 1 }));
      for (let i = blasts.length - 1; i >= 0; i--) {
        const age = (t - blasts[i].t0) / 1800;
        if (age > 1) blasts.splice(i, 1);
        else waves.push({ x: blasts[i].x, z: blasts[i].z, r: age * 1.6, gain: 2.2 });
      }
      const boost = 1 + focus * 0.6;

      for (const d of dots) {
        let lift = 0;
        for (const wv of waves) {
          const dist = Math.hypot(d.x - wv.x, d.z - wv.z);
          lift += Math.exp(-Math.abs(dist - wv.r) * 22) * Math.max(0, 1 - wv.r / (wv.gain > 1 ? 1.6 : 0.9)) * wv.gain;
        }
        lift = Math.min(1, lift);
        const shimmer = 0.5 + 0.5 * Math.sin(t * 0.0015 + d.seed * 6);
        const y = lift * 0.045 + (d.water ? 0.006 * Math.sin(t * 0.002 + d.x * 9) : 0);
        const p = P(d.x, y, d.z);
        const a = Math.min(1, (d.water ? 0.22 + 0.12 * shimmer : 0.32 + 0.16 * shimmer + 0.5 * lift) * boost);
        const r = Math.max(1, (4.2 / p.d) * (d.water ? 0.85 : 1 + lift));
        ctx!.fillStyle = d.water
          ? `rgba(56,189,248,${a})`
          : `rgba(${52 + Math.round(120 * lift)},${211 + Math.round(30 * lift)},${153 + Math.round(60 * lift)},${a})`;
        ctx!.fillRect(p.sx - r / 2, p.sy - r / 2, r, r);
      }

      // Arcs: every town's signal travels up and over to Kampala.
      for (const tw of towns) {
        if (tw.hub) continue;
        const len = Math.hypot(tw.x - hub.x, tw.z - hub.z);
        const top = 0.12 + len * 0.35;
        const at = (s: number) => P(tw.x + (hub.x - tw.x) * s, Math.sin(Math.PI * s) * top, tw.z + (hub.z - tw.z) * s);
        ctx!.beginPath();
        for (let s = 0; s <= 1.001; s += 0.05) { const q = at(s); if (s === 0) ctx!.moveTo(q.sx, q.sy); else ctx!.lineTo(q.sx, q.sy); }
        ctx!.strokeStyle = "rgba(110,231,183,0.10)"; ctx!.lineWidth = 1; ctx!.stroke();
        // The packet: a bright head with a short tail.
        const head = ((t / 2600) + tw.phase) % 1;
        for (let i = 0; i < 6; i++) {
          const s = head - i * 0.025;
          if (s < 0) continue;
          const q = at(s);
          ctx!.fillStyle = `rgba(167,243,208,${0.75 * (1 - i / 6)})`;
          ctx!.beginPath(); ctx!.arc(q.sx, q.sy, Math.max(0.8, 2.6 - i * 0.35), 0, Math.PI * 2); ctx!.fill();
        }
      }

      // Towns: a mast with a light; Kampala brightest, with a ring as signals land.
      ctx!.textAlign = "center";
      screen = [];
      for (const tw of towns) {
        const base = P(tw.x, 0, tw.z), top = P(tw.x, tw.hub ? 0.16 : 0.08, tw.z);
        ctx!.strokeStyle = tw.hub ? "rgba(167,243,208,0.7)" : "rgba(110,231,183,0.4)";
        ctx!.lineWidth = 1;
        ctx!.beginPath(); ctx!.moveTo(base.sx, base.sy); ctx!.lineTo(top.sx, top.sy); ctx!.stroke();
        ctx!.fillStyle = tw.hub ? "#d1fae5" : "rgba(167,243,208,0.85)";
        ctx!.beginPath(); ctx!.arc(top.sx, top.sy, tw.hub ? 3.4 : 2, 0, Math.PI * 2); ctx!.fill();
        screen.push({ name: tw.name, sx: top.sx, sy: top.sy });
        const named = tw.region && focus > 0.5;
        if (!small || tw.hub || named) {
          ctx!.font = named ? "600 12px ui-sans-serif, system-ui, sans-serif" : "500 10px ui-sans-serif, system-ui, sans-serif";
          ctx!.fillStyle = named ? "rgba(236,253,245,0.95)" : tw.hub ? "rgba(236,253,245,0.75)" : `rgba(209,250,229,${0.4 + 0.2 * focus})`;
          ctx!.fillText(named ? `${tw.name} · ${tw.region}` : tw.name, top.sx, top.sy - 8);
        }
      }
      const pulse = (t / 1300) % 1;
      ctx!.strokeStyle = `rgba(167,243,208,${0.5 * (1 - pulse)})`;
      ctx!.beginPath();
      for (let a = 0; a <= 28; a++) {
        const an = (a / 28) * Math.PI * 2, rr = 0.03 + pulse * 0.22;
        const q = P(hub.x + Math.cos(an) * rr, 0.002, hub.z + Math.sin(an) * rr);
        if (a) ctx!.lineTo(q.sx, q.sy); else ctx!.moveTo(q.sx, q.sy);
      }
      ctx!.stroke();
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
    const onDrag = (e: Event) => {
      const { dx, dy } = (e as CustomEvent<{ dx: number; dy: number }>).detail;
      user.yaw += dx * 0.008;
      user.pitch = Math.min(0.4, Math.max(-0.55, user.pitch + dy * 0.004));
      if (still) draw(lastT || 4000);
    };
    const onTap = (e: Event) => {
      const { x, y } = (e as CustomEvent<{ x: number; y: number }>).detail;
      let best: { name: string; d: number } | null = null;
      for (const s of screen) { const d = Math.hypot(s.sx - x, s.sy - y); if (!best || d < best.d) best = { name: s.name, d }; }
      const tw = best && best.d < 60 ? towns.find((q) => q.name === best!.name) : null;
      if (!tw) return;
      blasts.push({ x: tw.x, z: tw.z, t0: lastT });
      window.dispatchEvent(new CustomEvent("eastsound:map-select", { detail: { name: tw.name, region: tw.region ?? null, lat: tw.at[1], lon: tw.at[0] } }));
    };
    window.addEventListener("eastsound:map-drag", onDrag);
    window.addEventListener("eastsound:map-tap", onTap);
    const onVis = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden && !still) raf = requestAnimationFrame(loop);
    };

    resize();
    window.addEventListener("resize", resize);
    const onStillScroll = () => draw(4000);
    if (still) window.addEventListener("scroll", onStillScroll, { passive: true });
    if (!still) {
      window.addEventListener("pointermove", onPointer, { passive: true });
      document.addEventListener("visibilitychange", onVis);
      raf = requestAnimationFrame(loop);
    }
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("eastsound:map-drag", onDrag);
      window.removeEventListener("eastsound:map-tap", onTap);
      window.removeEventListener("scroll", onStillScroll);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [off]);

  if (off) return null;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
      <canvas ref={canvas} className="h-full w-full opacity-80" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_60%_45%,transparent_35%,rgba(2,6,23,0.6)_100%)]" />
    </div>
  );
}
