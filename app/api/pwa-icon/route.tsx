import { ImageResponse } from "next/og";

import { BACKGROUND_COLOR } from "@/lib/pwa";

/**
 * Home-screen icon, generated once per size and cached at the edge.
 * One source of truth for the mark, no binary assets in the repo.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(req: Request) {
  const url = new URL(req.url);
  const raw = Number(url.searchParams.get("size"));
  const size = [180, 192, 384, 512].includes(raw) ? raw : 512;
  const maskable = url.searchParams.get("maskable") === "1";
  const pad = maskable ? size * 0.16 : size * 0.08;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: `linear-gradient(145deg, ${BACKGROUND_COLOR} 0%, #052e2b 55%, #064e3b 100%)`,
          padding: pad,
        }}
      >
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: `${Math.max(2, size * 0.02)}px solid rgba(52, 211, 153, 0.55)`,
            borderRadius: maskable ? size * 0.12 : size * 0.22,
          }}
        >
          <span
            style={{
              fontSize: size * (maskable ? 0.3 : 0.34),
              fontWeight: 800,
              letterSpacing: -size * 0.02,
              color: "#6ee7b7",
            }}
          >
            ES
          </span>
        </div>
      </div>
    ),
    {
      width: size,
      height: size,
      headers: {
        "cache-control": "public, max-age=604800, immutable",
        "content-type": "image/png",
      },
    },
  );
}

