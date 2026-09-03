import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The live preview is proxied under a sandbox host; without this Next 16
  // blocks its dev-only resources (HMR) as cross-origin.
  allowedDevOrigins: ["*.e2b.app"],
};

export default nextConfig;
