import type { MetadataRoute } from "next";

// Public pages may be indexed; accounts, dashboards and APIs may not.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/dashboard", "/api", "/auth", "/setup", "/pending"] }],
    sitemap: undefined,
  };
}
