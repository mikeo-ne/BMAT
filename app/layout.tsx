import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "@/components/Providers";

export const metadata: Metadata = {
  title: { default: "East Sound Technologies — Airplay & Copyright Intelligence", template: "%s · East Sound" },
  description:
    "Broadcast monitoring, airplay charts and royalty evidence for Uganda's music industry. A 7H Music Group Ltd company.",
};

export const viewport: Viewport = { themeColor: "#020617", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className="min-h-screen font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
