/** @type {import('next').NextConfig} */

// Security headers for every page: no framing by other sites (clickjacking),
// HTTPS only, no MIME sniffing, private referrers, and no camera/mic/location.
//
// In development the framing rules are relaxed: the sandbox preview is shown
// inside an iframe on a different origin, and X-Frame-Options: DENY would
// blank it. Production keeps the strict pair.
const isDev = process.env.NODE_ENV === "development";
const security = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  ...(isDev ? [] : [{ key: "X-Frame-Options", value: "DENY" }]),
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  {
    key: "Content-Security-Policy",
    value: isDev
      ? "frame-ancestors 'self' https://*.e2b.app; base-uri 'self'; object-src 'none'; form-action 'self'"
      : "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'",
  },
];

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // The preview host is <port>-<sandbox>.e2b.app; without this, dev assets are
  // refused as cross-origin and the page loads unstyled.
  allowedDevOrigins: ["*.e2b.app", "localhost", "127.0.0.1"],
  async headers() {
    return [
      { source: "/:path*", headers: security },
      {
        source: "/dashboard/:path*",
        headers: [
          // Dashboards are per-user: never cache them in shared caches, never index them.
          { key: "Cache-Control", value: "private, no-store" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
    ];
  },
};

export default nextConfig;
