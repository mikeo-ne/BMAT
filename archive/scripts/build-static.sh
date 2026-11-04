#!/usr/bin/env bash
# Build a read-only static export of East Sound for GitHub Pages.
#
# GitHub Pages serves only static files: no Node server, no API routes, no SSR.
# So this script builds a throwaway copy that (a) drops app/api, (b) removes
# `force-dynamic` so pages prerender at build time, and (c) sets `output: export`
# with the repo's basePath. The primary server build keeps its API routes;
# deployment capability guards still reject unsupported Vercel master writes.
#
# Result: ./.static-build/out/ ready to upload to GitHub Pages. Read-only: delivery/upload and
# unsupported mutations are disabled rather than reported as successful.
set -euo pipefail

REPO="${GITHUB_REPOSITORY:-BMAT}"
REPO="${REPO#*/}"                       # repo name, e.g. BMAT — update if the repository is renamed
BASE_PATH="${BASE_PATH:-/${REPO}}"
SRC="$(cd "$(dirname "$0")/.." && pwd)"
TMP="${SRC}/.static-build"

echo "→ staging static build at ${TMP} (basePath=${BASE_PATH})"
rm -rf "${TMP}"
mkdir -p "${TMP}"

# Copy application source, skipping build artefacts, data, dependencies and VCS.
# API tests are checked in the primary build; their imports cannot resolve after
# app/api is intentionally removed from this read-only staging copy.
tar -C "${SRC}" \
  --exclude='./.git' --exclude='./.next' --exclude='./out' --exclude='./.data' \
  --exclude='./.env*' --exclude='./node_modules' --exclude='./.static-build' --exclude='./.arena' \
  --exclude='./tests' --exclude='./vitest*.config.mts' --exclude='./db' \
  --exclude='./scripts/database.ts' --exclude='./scripts/notification-worker.ts' --exclude='./tsconfig.tsbuildinfo' \
  -cf - . | tar -C "${TMP}" -xf -

# 1. No API routes in a static export.
rm -rf "${TMP}/app/api"

# Private pages must never be exported as unauthenticated HTML, even when a production DB is configured.
find "${TMP}/app/dashboard" -mindepth 1 -maxdepth 1 -type d ! -name charts ! -name stats -exec rm -rf {} +

# 2. Prerender: strip force-dynamic so every page is built at compile time.
find "${TMP}/app" -type f \( -name '*.tsx' -o -name '*.ts' \) -exec sed -i -E 's/export const dynamic[[:space:]]*=[[:space:]]*"force-dynamic";//g' {} +

# 3. Static-export config with the Pages basePath.
cat > "${TMP}/next.config.ts" <<CFG
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  serverExternalPackages: ["pg"],
  basePath: process.env.BASE_PATH || "${BASE_PATH}",
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
CFG

# Reuse the parent install.
ln -s "${SRC}/node_modules" "${TMP}/node_modules"

echo "→ building (public charts and statistics only)…"
cd "${TMP}"
EAST_SOUND_DATA_DIR="${TMP}/.data" EAST_SOUND_STATIC_EXPORT=1 BASE_PATH="${BASE_PATH}" npx next build

echo "→ static site ready at ${TMP}/out"
