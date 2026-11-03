import { describe, expect, it } from "vitest";
import {
  ARTICLES,
  ARTICLE_CATEGORIES,
  DEMO_CHART_ROWS,
  FEED_PING_SEED,
  TIERS,
  USE_CASES,
  SOLUTIONS,
} from "@/lib/site-content";
import { TRANSLATIONS, translate } from "@/lib/site-i18n";
import { snippetScale } from "@/lib/snippet-audio";

describe("site tiers", () => {
  it("defines five distinct tiers covering every role", () => {
    expect(TIERS.map((tier) => tier.id).sort()).toEqual(
      ["artist", "broadcaster", "cmo", "label", "venue"].sort(),
    );
    for (const tier of TIERS) {
      expect(tier.label.length).toBeGreaterThan(0);
      expect(tier.features.length).toBeGreaterThan(0);
      expect(tier.href.startsWith("/")).toBe(true);
    }
  });

  it("maps every taxonomy item to an internal route", () => {
    for (const item of [...USE_CASES, ...SOLUTIONS]) {
      expect(item.href.startsWith("/")).toBe(true);
      expect(item.blurb.length).toBeGreaterThan(0);
    }
  });
});

describe("articles", () => {
  it("uses unique slugs and valid categories", () => {
    const slugs = new Set<string>();
    for (const article of ARTICLES) {
      expect(slugs.has(article.slug)).toBe(false);
      slugs.add(article.slug);
      expect(ARTICLE_CATEGORIES).toContain(article.category);
      expect(article.excerpt.length).toBeGreaterThan(0);
      expect(article.readMinutes).toBeGreaterThan(0);
      expect(article.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    expect(ARTICLES.length).toBeGreaterThanOrEqual(5);
  });

  it("renders every body block with required fields", () => {
    for (const article of ARTICLES) {
      expect(article.body.length).toBeGreaterThan(0);
      for (const block of article.body) {
        if (block.type === "list") {
          expect(block.items.length).toBeGreaterThan(0);
        } else {
          expect(block.text.length).toBeGreaterThan(0);
        }
      }
    }
  });
});

describe("demo chart rows", () => {
  it("ranks sequentially and keeps movement consistent", () => {
    expect(DEMO_CHART_ROWS.length).toBe(10);
    for (let i = 0; i < DEMO_CHART_ROWS.length; i += 1) {
      const row = DEMO_CHART_ROWS[i];
      expect(row.rank).toBe(i + 1);
      if (row.previousRank === null) {
        expect(row.movement).toBeNull();
      } else {
        expect(row.movement).toBe(row.previousRank - row.rank);
      }
      expect(row.trend).toHaveLength(14);
      expect(row.spins7d).toBeGreaterThan(0);
      expect(row.confidence).toBeGreaterThan(0);
      expect(row.confidence).toBeLessThanOrEqual(1);
    }
  });
});

describe("stream monitor seed", () => {
  it("covers Kampala stations with plausible confidence scores", () => {
    expect(FEED_PING_SEED.length).toBeGreaterThanOrEqual(10);
    for (const ping of FEED_PING_SEED) {
      expect(ping.station.length).toBeGreaterThan(0);
      expect(ping.track.length).toBeGreaterThan(0);
      expect(ping.confidence).toBeGreaterThan(0.8);
      expect(ping.confidence).toBeLessThanOrEqual(1);
    }
  });
});

describe("snippet scale", () => {
  it("is deterministic and produces a playable root note", () => {
    const a = snippetScale("mulongo-ariah-k");
    const b = snippetScale("mulongo-ariah-k");
    expect(a).toEqual(b);
    expect(a.root).toBeGreaterThan(0);
    expect(a.offsets.length).toBeGreaterThan(0);
    for (const offset of a.offsets) expect(offset).toBeGreaterThanOrEqual(0);
    expect(snippetScale("different-seed").root).not.toBe(a.root);
  });
});

describe("site i18n", () => {
  it("keeps key sets identical across all three languages", () => {
    const keys = Object.keys(TRANSLATIONS.en).sort();
    expect(Object.keys(TRANSLATIONS.sw).sort()).toEqual(keys);
    expect(Object.keys(TRANSLATIONS.lu).sort()).toEqual(keys);
  });

  it("interpolates params and falls back to English", () => {
    expect(
      translate("en", "monitor.stations", { count: 32 }),
    ).toContain("32");
    expect(translate("sw", "monitor.stations", { count: 32 })).toContain("32");
    expect(translate("lu", "charts.title", { week: "2026-11-02" })).toContain(
      "2026-11-02",
    );
    expect(translate("en", "nonexistent.key")).toBe("nonexistent.key");
  });
});
