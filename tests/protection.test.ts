import { describe, expect, it } from "vitest";
import robots from "@/app/robots";
import nextConfig from "../next.config.mjs";

describe("site protection", () => {
  it("keeps dashboards, APIs and sign-in pages out of search engines", () => {
    const rules = robots().rules as { disallow: string[] }[];
    expect(rules[0].disallow).toEqual(expect.arrayContaining(["/dashboard", "/api", "/auth", "/setup"]));
  });

  it("sends security headers on every page", async () => {
    const all = (await nextConfig.headers()).find((h: { source: string }) => h.source === "/:path*");
    const keys = all.headers.map((h: { key: string }) => h.key);
    expect(keys).toEqual(expect.arrayContaining([
      "Strict-Transport-Security", "X-Frame-Options", "X-Content-Type-Options", "Referrer-Policy", "Permissions-Policy", "Content-Security-Policy",
    ]));
    expect(all.headers.find((h: { key: string }) => h.key === "X-Frame-Options").value).toBe("DENY");
  });
});
