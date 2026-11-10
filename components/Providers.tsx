"use client";

import type { ReactNode } from "react";
import { AuthProvider } from "@/lib/auth-context";
import { I18nProvider } from "@/lib/i18n";
import { AuthModal } from "./site/AuthModal";
import { PwaRegister } from "./PwaRegister";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <I18nProvider>
      <AuthProvider>
        {children}
        <AuthModal />
        <PwaRegister />
      </AuthProvider>
    </I18nProvider>
  );
}
