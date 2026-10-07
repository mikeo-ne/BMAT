import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    screens: {
      xs: "400px",
      sm: "640px",
      md: "768px",
      lg: "1024px",
      xl: "1280px",
      "2xl": "1536px",
    },
    extend: {
      colors: {
        ink: "#172033",
        muted: "#64748b",
        line: "#e2e8f0",
        brand: {
          DEFAULT: "#6941c6",
          dark: "#4d2aa2",
          light: "#efeaff",
        },
        accent: "#159b82",
        surface: "#ffffff",
        canvas: "#f5f7fb",
      },
      boxShadow: {
        card: "0 8px 30px rgba(24, 39, 75, 0.06)",
        float: "0 18px 55px rgba(24, 39, 75, 0.16)",
      },
      borderRadius: {
        xl: "0.875rem",
      },
    },
  },
  plugins: [],
};

export default config;
