"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { POSTS, type BlogPost } from "@/lib/data/public";
import { cx, fmtInt, safeArray } from "@/lib/safe";
import { isSupabaseConfigured } from "@/lib/supabase/config";

const CATS = ["All", "Guides", "Industry", "Product", "Charts", "Policy"] as const;

function MetricFeed() {
  if (isSupabaseConfigured) return null; // sample numbers: demo mode only, never on the live site
  return <SampleMetrics />;
}

function SampleMetrics() {
  // Starts from fixed values on the server; ticks only after mount (no hydration mismatch).
  const [m, setM] = useState({ detections: 18432, matched: 17361, streams: 32, venues: 152 });
  useEffect(() => {
    const id = window.setInterval(() => {
      setM((p) => {
        const add = 1 + Math.floor(Math.random() * 4);
        return { ...p, detections: p.detections + add, matched: p.matched + Math.max(0, add - (Math.random() < 0.15 ? 1 : 0)) };
      });
    }, 2500);
    return () => window.clearInterval(id);
  }, []);

  const cells = [
    { k: "Detections (24h)", v: fmtInt(m.detections) },
    { k: "Matched", v: fmtInt(m.matched) },
    { k: "Streams monitored", v: fmtInt(m.streams) },
    { k: "Venue nodes", v: `${fmtInt(m.venues)}` },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-live="polite">
      {cells.map((c) => (
        <div key={c.k} className="glass p-4">
          <p className="text-xs uppercase tracking-wider text-slate-500">{c.k}</p>
          <p className="mt-1 font-mono text-2xl font-bold text-emerald-300 glow-text">{c.v}</p>
        </div>
      ))}
    </div>
  );
}

export function BlogHub() {
  const [cat, setCat] = useState<(typeof CATS)[number]>("All");
  const [q, setQ] = useState("");

  const posts = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return safeArray<BlogPost>(POSTS).filter(
      (p) => (cat === "All" || p.category === cat) && (!needle || `${p.title} ${p.excerpt}`.toLowerCase().includes(needle)),
    );
  }, [cat, q]);

  return (
    <div>
      <p className="font-mono text-xs uppercase tracking-widest text-emerald-400">Live platform metrics</p>
      <h1 className="mt-2 text-4xl font-bold text-white">East Sound Journal</h1>
      <div className="mt-6">
        <MetricFeed />
      </div>

      <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {CATS.map((c) => (
            <button key={c} type="button" onClick={() => setCat(c)} className={cx("pill", cat === c ? "pill-on" : "pill-off")}>
              {c}
            </button>
          ))}
        </div>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search articles…"
          aria-label="Search articles"
          className="input sm:max-w-xs"
        />
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {posts.map((p) => (
          <Link key={p.slug} href={`/blog/${p.slug}`} className="glass group block p-5 transition hover:border-emerald-400/40">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400">{p.category}</span>
            <h2 className="mt-2 font-semibold text-white group-hover:text-emerald-200">{p.title}</h2>
            <p className="mt-2 text-sm text-slate-400">{p.excerpt}</p>
            <p className="mt-4 text-xs text-slate-500">
              {p.date} · {p.minutes} min read
            </p>
          </Link>
        ))}
        {posts.length === 0 && <p className="text-sm text-slate-500">No articles match “{q}”.</p>}
      </div>
    </div>
  );
}
