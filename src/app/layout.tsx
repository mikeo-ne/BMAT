import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "EastSound Monitor",
    template: "%s | EastSound Monitor",
  },
  description:
    "Uganda airplay monitoring, catalogue delivery and verified radio spins for artists and labels across East Africa.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
