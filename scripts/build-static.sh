#!/usr/bin/env bash
# Build a read-only static export of East Sound for GitHub Pages.
#
# GitHub Pages serves only static files: no Node server, no API routes, no SSR.
# So this script builds a throwaway copy that (a) drops app/api, (b) removes
# `force-dynamic` so pages prerender at build time, and (c) sets `output: export`
# with the repo's basePath. The primary server build (Vercel/Netlify/local) is
# untouched and keeps uploads + persistence.
#
# Result: ./out/ ready to upload to GitHub Pages. Read-only: delivery/upload and
# any mutation hit the (absent) API and surface a friendly error in the UI.
set -euo pipefail

REPO="${GITHUB_REPOSITORY:-BMAT}"
REPO="${REPO#*/}"                       # repo name, e.g. BMAT — update if the repository is renamed
BASE_PATH="${BASE_PATH:-/${REPO}}"
SRC="$(cd "$(dirname "$0")/.." && pwd)"
TMP="${SRC}/.static-build"

echo "→ staging static build at ${TMP} (basePath=${BASE_PATH})"
rm -rf "${TMP}"
mkdir -p "${TMP}"

# Copy source, skipping build artefacts, data, node_modules and VCS.
tar -C "${SRC}" \
  --exclude='./.git' --exclude='./.next' --exclude='./out' --exclude='./.data' \
  --exclude='./node_modules' --exclude='./.static-build' --exclude='./.arena' \
  -cf - . | tar -C "${TMP}" -xf -

# 1. No API routes in a static export.
rm -rf "${TMP}/app/api"

# 2. Prerender: strip force-dynamic so every page is built at compile time.
grep -rl 'export const dynamic = "force-dynamic";' "${TMP}/app" \
  | xargs -r sed -i '/export const dynamic = "force-dynamic";/d'

# 3. Static-export config with the Pages basePath.
cat > "${TMP}/next.config.ts" <<CFG
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  basePath: process.env.BASE_PATH || "${BASE_PATH}",
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
CFG

# Reuse the parent install.
ln -s "${SRC}/node_modules" "${TMP}/node_modules"

echo "→ building (this prerenders every dashboard)…"
cd "${TMP}"
BASE_PATH="${BASE_PATH}" npx next build

echo "→ static site ready at ${TMP}/out"
