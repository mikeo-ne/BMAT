import { describe, expect, it } from "vitest";
import sitemap from "@/app/sitemap";
import robots from "@/app/robots";
import { POSTS } from "@/lib/data/public";
import { SITE_URL, jsonLd, siteJsonLd } from "@/lib/seo";

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
