"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { safeStorage } from "./safe";

export const LANGS = [
  { code: "en", label: "EN", name: "English" },
  { code: "lg", label: "LG", name: "Luganda" },
  { code: "sw", label: "SW", name: "Kiswahili" },
] as const;
export type Lang = (typeof LANGS)[number]["code"];

// Luganda & Kiswahili: reviewed 5 Nov 2026 for meaning and grammar; a native speaker should still sign off before launch.
const DICT = {
  en: {
    solutions: "Solutions",
    useCases: "Use Cases",
    blog: "Blog",
    signIn: "Sign in",
    dashboard: "My dashboard",
    live: "32 Streams & 150+ Venues Active",
    liveTpl: "{s} Streams & {v} Venues Active",
    liveStationsTpl: "{s} Stations Monitored Live",
    heroTitle: "Every spin. Every station. Every shilling accounted for.",
    heroSub:
      "East Sound monitors Ugandan radio around the clock, matches what plays to who owns it, and turns airplay into evidence-backed royalties. TV and venue monitoring are coming next.",
    ctaCharts: "Explore Live Charts",
    ctaUseCase: "Choose Use Case",
    chartTitle: "National Top 10 Airplay",
    allRegions: "All Uganda",
  },
  lg: {
    solutions: "Eby'okugonjoola",
    useCases: "Abakozesa",
    blog: "Amawulire",
    signIn: "Yingira",
    dashboard: "Dashibodi yange",
    live: "Emikutu 32 n'ebifo 150+ biri ku mpewo",
    liveTpl: "Emikutu {s} n'ebifo {v} biri ku mpewo",
    liveStationsTpl: "Emikutu {s} biri ku mpewo",
    heroTitle: "Buli luyimba, buli mukutu, buli shilingi — byonna bibalibwa.",
    heroSub:
      "East Sound ewuliriza leediyo mu Uganda essaawa 24, n'ezuula nnannyini buli luyimba olukubiddwa, n'ekakasa nti bannannyini nnyimba basasulwa nga balina obujulizi. Okuwuliriza TV n'ebifo by'okusanyukiramu kujja mangu.",
    ctaCharts: "Laba Ennyimba Ezisinga",
    ctaUseCase: "Londa Ekikukwatako",
    chartTitle: "Ennyimba 10 Ezisinga ku Leediyo mu Ggwanga",
    allRegions: "Uganda Yonna",
  },
  sw: {
    solutions: "Suluhisho",
    useCases: "Matumizi",
    blog: "Blogu",
    signIn: "Ingia",
    dashboard: "Dashibodi yangu",
    live: "Vituo 32 na Kumbi 150+ Hewani",
    liveTpl: "Vituo {s} na Kumbi {v} Hewani",
    liveStationsTpl: "Vituo {s} Vinafuatiliwa Moja kwa Moja",
    heroTitle: "Kila wimbo. Kila kituo. Kila shilingi inahesabiwa.",
    heroSub:
      "East Sound hufuatilia redio za Uganda saa 24, hulinganisha kila wimbo unaochezwa na mmiliki wake, na kugeuza uchezaji kuwa mrabaha wenye ushahidi. Ufuatiliaji wa TV na kumbi unakuja hivi karibuni.",
    ctaCharts: "Tazama Chati za Moja kwa Moja",
    ctaUseCase: "Chagua Matumizi",
    chartTitle: "Nyimbo 10 Bora Redioni Kitaifa",
    allRegions: "Uganda Yote",
  },
} as const;

export type DictKey = keyof (typeof DICT)["en"];

type I18n = { lang: Lang; setLang: (l: Lang) => void; t: (k: DictKey) => string };
const Ctx = createContext<I18n>({ lang: "en", setLang: () => undefined, t: (k) => DICT.en[k] });

export function I18nProvider({ children }: { children: ReactNode }) {
  // Always render "en" on the server and first client paint, then apply the saved choice.
  const [lang, setLangState] = useState<Lang>("en");

  useEffect(() => {
    const saved = safeStorage.get<string>("est_lang", "en");
    if (saved === "en" || saved === "lg" || saved === "sw") setLangState(saved);
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang === "lg" ? "lg" : lang;
  }, [lang]);

  const setLang = (l: Lang) => {
    setLangState(l);
    safeStorage.set("est_lang", l);
  };

  const t = (k: DictKey) => DICT[lang]?.[k] ?? DICT.en[k];
  return <Ctx.Provider value={{ lang, setLang, t }}>{children}</Ctx.Provider>;
}

export const useI18n = () => useContext(Ctx);
