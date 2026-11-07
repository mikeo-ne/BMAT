import { describe, expect, it } from "vitest";
import sitemap from "@/app/sitemap";
import robots from "@/app/robots";
import { POSTS } from "@/lib/data/public";
import { SITE_URL, jsonLd, siteJsonLd } from "@/lib/seo";
import { toBlocks } from "@/components/site/ArticleBody";

describe("search engine setup", () => {
  it("lists the homepage, blog, every article and the legal pages in the sitemap", () => {
    const urls = sitemap().map((e) => e.url);
    expect(urls).toContain(`${SITE_URL}/`);
    expect(urls).toContain(`${SITE_URL}/blog`);
    for (const p of POSTS) expect(urls).toContain(`${SITE_URL}/blog/${p.slug}`);
    expect(urls).toContain(`${SITE_URL}/legal/terms`);
  });

  it("never puts private pages in the sitemap", () => {
    for (const { url } of sitemap()) expect(url).not.toMatch(/\/(dashboard|api|auth|setup|pending)\b/);
  });

  it("points robots.txt at the sitemap", () => {
    expect(robots().sitemap).toBe(`${SITE_URL}/sitemap.xml`);
  });

  it("describes the organisation for Google and escapes script-breaking characters", () => {
    const text = jsonLd(siteJsonLd());
    expect(text).toContain('"@type":"Organization"');
    expect(jsonLd({ x: "</script>" })).not.toContain("</script>");
  });
});


describe("guides", () => {
  const guides = POSTS.filter((p) => p.category === "Guides");

  it("has unique slugs and a source list on every guide", () => {
    expect(new Set(POSTS.map((p) => p.slug)).size).toBe(POSTS.length);
    expect(guides.length).toBeGreaterThanOrEqual(5);
    for (const g of guides) expect(g.sources?.length).toBeGreaterThan(0);
  });

  it("keeps descriptions short enough for search results", () => {
    for (const p of POSTS) expect(p.excerpt.length).toBeLessThanOrEqual(200);
  });

  it("turns headings and bullets into blocks", () => {
    expect(toBlocks(["## A", "x", "- one", "- two", "y"])).toEqual([
      { kind: "h2", text: "A" },
      { kind: "p", text: "x" },
      { kind: "ul", items: ["one", "two"] },
      { kind: "p", text: "y" },
    ]);
  });
});
