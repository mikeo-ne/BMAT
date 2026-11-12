import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "Segoe UI", "Roboto", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      boxShadow: {
        glow: "0 0 24px -4px rgba(52, 211, 153, 0.55)",
        "glow-sm": "0 0 12px -2px rgba(52, 211, 153, 0.45)",
      },
      keyframes: {
        marquee: { "0%": { transform: "translateX(0)" }, "100%": { transform: "translateX(-50%)" } },
        pulseRing: {
          "0%": { transform: "scale(0.8)", opacity: "0.8" },
          "100%": { transform: "scale(2.2)", opacity: "0" },
        },
        rings: {
          "0%, 100%": { transform: "perspective(900px) rotateX(0deg) rotateY(0deg)" },
          "50%": { transform: "perspective(900px) rotateX(38deg) rotateY(-22deg)" },
        },
        fadeIn: { "0%": { opacity: "0", transform: "translateY(4px)" }, "100%": { opacity: "1", transform: "none" } },
      },
      animation: {
        marquee: "marquee 40s linear infinite",
        "pulse-ring": "pulseRing 1.6s ease-out infinite",
        "fade-in": "fadeIn 180ms ease-out",
        rings: "rings 18s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
