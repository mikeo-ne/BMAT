import { AuthProvider } from "@/components/auth-provider";
import { serverSession, userDto } from "@/lib/auth";
import { authenticationAvailable } from "@/lib/security-store";
import type { Metadata } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import "./globals.css";

export const metadata: Metadata = {
  referrer: "no-referrer",
  title: {
    default: "East Sound",
    template: "%s · East Sound",
  },
  description:
    "East Sound measures music airplay across Uganda's FM panel and gives artists, labels and stations one shared source of truth for spins.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const auth = await serverSession();
  const initial = auth
    ? {
        user: userDto(auth.user),
        csrfToken: auth.session.csrfToken,
        expiresAt: auth.session.expiresAt,
      }
    : { user: null, csrfToken: null, expiresAt: null };
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <AuthProvider initial={initial} available={authenticationAvailable()}>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
