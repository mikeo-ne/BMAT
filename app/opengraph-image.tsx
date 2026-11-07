import { ImageResponse } from "next/og";

export const alt = "East Sound Technologies — radio airplay monitoring and music royalty tracking in Uganda";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const BARS = [18, 34, 52, 30, 46, 22, 40, 58, 28, 44, 20, 36];

// The preview card shown when the site is shared on WhatsApp, X, Facebook, LinkedIn or in search.
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: "linear-gradient(135deg, #020617 0%, #022c22 100%)",
          color: "white",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, height: 72, padding: "0 16px", borderRadius: 18, background: "#022c22", border: "2px solid #34d39955" }}>
            {[8, 16, 22, 14, 20, 10].map((h, i) => (
              <div key={i} style={{ width: 6, height: h * 2, borderRadius: 3, background: "#34d399" }} />
            ))}
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 40, fontWeight: 700 }}>East Sound</div>
            <div style={{ fontSize: 18, letterSpacing: 6, color: "#6ee7b7" }}>TECHNOLOGIES</div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ fontSize: 66, fontWeight: 800, lineHeight: 1.05, maxWidth: 960 }}>Know every time your song plays on radio.</div>
          <div style={{ fontSize: 30, color: "#94a3b8", maxWidth: 940 }}>
            24/7 airplay monitoring, charts and royalty evidence for Uganda&apos;s music industry.
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
          <div style={{ fontSize: 26, color: "#34d399" }}>eastsound.vercel.app</div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
            {BARS.map((h, i) => (
              <div key={i} style={{ width: 12, height: h, borderRadius: 4, background: i % 3 === 0 ? "#34d399" : "#065f46" }} />
            ))}
          </div>
        </div>
      </div>
    ),
    size,
  );
}
