"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import type { ArtistView } from "@/lib/workspaces";

interface ArtistNavigation {
  view: ArtistView;
  select: (view: ArtistView) => void;
}
const ArtistNavigationContext = createContext<ArtistNavigation | null>(null);

/** URL-backed tabs inside the shell; local tabs still work in standalone component consumers. */
export function ArtistNavigationProvider({
  value,
  children,
}: {
  value: ArtistNavigation | null;
  children: ReactNode;
}) {
  return (
    <ArtistNavigationContext.Provider value={value}>
      {children}
    </ArtistNavigationContext.Provider>
  );
}
export function useArtistNavigation(
  initialView: ArtistView,
): [ArtistView, (view: ArtistView) => void] {
  const navigation = useContext(ArtistNavigationContext);
  const [localView, setLocalView] = useState(initialView);
  return navigation
    ? [navigation.view, navigation.select]
    : [localView, setLocalView];
}
