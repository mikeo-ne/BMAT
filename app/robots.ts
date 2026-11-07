import type { MetadataRoute } from "next";
import { SITE_URL, abs } from "@/lib/seo";

// Public pages may be indexed; accounts, dashboards and APIs may not.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/dashboard", "/api", "/auth", "/setup", "/pending"] }],
    sitemap: abs("/sitemap.xml"),
    host: SITE_URL,
  };
}
