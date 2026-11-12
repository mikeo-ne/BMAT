"use client";

import { useEffect, useRef, useState } from "react";

/**
 * "Listening across Uganda". The 3D map itself is the site backdrop
 * (SiteBackdrop): when this section is on screen the map glides into the box
 * marked `data-map-stage`, so there is only ever one map. This box passes drags
 * and taps to it, and the info card shows whichever town was tapped.
 */
type Pick = { name: string; region: string | null; lat: number; lon: number };

export function SignalField() {
  const [focus, setFocus] = useState<Pick>({ name: "Kampala", region: "Central", lat: 0.35, lon: 32.58 });
  const drag = useRef<{ x: number; y: number; moved: number } | null>(null);

  useEffect(() => {
    const onSelect = (e: Event) => setFocus((e as CustomEvent<Pick>).detail);
    window.addEventListener("eastsound:map-select", onSelect);
    return () => window.removeEventListener("eastsound:map-select", onSelect);
  }, []);

  const send = (name: string, detail: object) => window.dispatchEvent(new CustomEvent(name, { detail }));

  return (
    <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6" aria-labelledby="airwaves-title">
      <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        <div className="relative z-10">
          <p className="font-mono text-xs uppercase tracking-widest text-emerald-400">The airwaves, live</p>
          <h2 id="airwaves-title" className="mt-2 text-3xl font-bold text-white">Listening across Uganda, every second</h2>
          <p className="mt-3 text-slate-400">
            Each beacon is a region we monitor. Every station there is fingerprinted around the clock, so when your song plays in Gulu at 2 a.m., it&apos;s on your dashboard minutes later.
          </p>
          <div className="mt-5 rounded-xl border border-emerald-400/20 bg-slate-950/70 p-4 backdrop-blur" aria-live="polite">
            <p className="font-mono text-[10px] uppercase tracking-widest text-emerald-300/80">{focus.region ? `${focus.region} region` : "Town"}</p>
            <p className="mt-1 text-lg font-semibold text-white">{focus.name}</p>
            <p className="text-xs text-slate-500">{`${Math.abs(focus.lat).toFixed(2)}°${focus.lat >= 0 ? "N" : "S"}, ${focus.lon.toFixed(2)}°E`}</p>
          </div>
          <p className="mt-3 text-xs text-slate-500">Drag to turn the map · tap a town to send a signal.</p>
        </div>
        <div
          data-map-stage
          role="img"
          aria-label="3D map of Uganda with signals travelling from towns to Kampala; beacons mark the Central, Western, Eastern and Northern regions"
          className="h-[340px] w-full cursor-grab touch-pan-y select-none active:cursor-grabbing sm:h-[460px]"
          onPointerDown={(e) => { drag.current = { x: e.clientX, y: e.clientY, moved: 0 }; e.currentTarget.setPointerCapture(e.pointerId); }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d) return;
            const dx = e.clientX - d.x, dy = e.clientY - d.y;
            d.moved += Math.abs(dx) + Math.abs(dy); d.x = e.clientX; d.y = e.clientY;
            send("eastsound:map-drag", { dx, dy });
          }}
          onPointerUp={(e) => {
            if (drag.current && drag.current.moved < 6) send("eastsound:map-tap", { x: e.clientX, y: e.clientY });
            drag.current = null;
          }}
          onPointerCancel={() => { drag.current = null; }}
        />
      </div>
    </section>
  );
}
