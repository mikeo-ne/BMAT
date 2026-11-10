import type { MetadataRoute } from "next";
import { POSTS } from "@/lib/data/public";
import { abs } from "@/lib/seo";

// Every public page, so search engines find them without guessing.
export default function sitemap(): MetadataRoute.Sitemap {
  const newest = (POSTS || []).map((p) => p.date).sort().at(-1);
  return [
    { url: abs("/"), changeFrequency: "daily", priority: 1 },
    { url: abs("/coverage"), changeFrequency: "daily", priority: 0.8 },
    { url: abs("/blog"), lastModified: newest, changeFrequency: "weekly", priority: 0.8 },
    ...(POSTS || []).map((p) => ({
      url: abs(`/blog/${p.slug}`),
      lastModified: p.date,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
    { url: abs("/legal/terms"), changeFrequency: "yearly", priority: 0.2 },
    { url: abs("/legal/privacy"), changeFrequency: "yearly", priority: 0.2 },
  ];
}
