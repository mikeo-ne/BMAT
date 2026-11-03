/**
 * Minimal three-language dictionary for the public site chrome (nav, hero,
 * section headings, footer). Article bodies stay in English; the chrome is
 * what visitors navigate with first.
 */

export type SiteLanguage = "en" | "sw" | "lu";

export interface LanguageOption {
  code: SiteLanguage;
  label: string;
  short: string;
}

export const LANGUAGES: LanguageOption[] = [
  { code: "en", label: "English", short: "EN" },
  { code: "sw", label: "Kiswahili", short: "SW" },
  { code: "lu", label: "Luganda", short: "LU" },
];

export const TRANSLATIONS: Record<SiteLanguage, Record<string, string>> = {
  en: {
    "nav.useCases": "Use Cases",
    "nav.solutions": "Solutions",
    "nav.about": "About",
    "nav.insights": "Insights",
    "nav.accessPortal": "Access Portal",
    "nav.signIn": "Sign in",
    "nav.signOut": "Sign out",
    "nav.language": "Language",
    "nav.openMenu": "Open menu",
    "nav.closeMenu": "Close menu",
    "nav.brand": "East Sound",
    "nav.tagline": "East Africa Airplay Analytics",
    "hero.eyebrow": "Music-first airplay intelligence",
    "hero.title": "Music-First. Transparency-Driven.",
    "hero.subtitle": "East Sound measures music airplay across Uganda's FM panel and gives artists, labels, stations and collecting societies one shared source of truth for every spin.",
    "hero.ctaCharts": "Explore Live Airplay Charts",
    "hero.ctaPilot": "Station Pilot Access",
    "hero.builtFor": "Built for East Africa — UG · KE · TZ · RW",
    "tiers.eyebrow": "Choose your workspace",
    "tiers.title": "One platform, four roles",
    "tiers.subtitle": "Pick the tier that matches how you work. Each opens a workspace tuned to your job — from browsing the charts to settling royalties.",
    "tiers.openTier": "Open {tier}",
    "monitor.title": "LIVE STREAM MONITOR",
    "monitor.subtitle": "Captured airplay pings from Kampala's FM panel",
    "monitor.stations": "{count} Stations Active",
    "monitor.ping": "{station} · {track} — {artist}",
    "monitor.empty": "Waiting for the next ping…",
    "monitor.confidence": "match confidence",
    "monitor.evidence": "10s evidence",
    "monitor.recent": "Recent captures",
    "monitor.badge": "Captured panel feed · illustrative",
    "solutions.eyebrow": "The operating system",
    "solutions.title": "BMAT-style suite, built for the region",
    "solutions.subtitle": "Vericast, Reportal, ReSol, the national charts and AD Control — the modules the region's music business already runs on.",
    "about.eyebrow": "About East Sound",
    "about.title": "From a Kampala studio to the region's airwaves",
    "about.subtitle":
      "East Sound began inside 7H Music Group. Today the connected FM panel settles royalties and ranks the national Top 100.",
    "about.statsTitle": "Mission stats",
    "about.teamTitle": "The team keeping the panel honest",
    "about.teamSubtitle":
      "Producers, engineers, auditors and chart researchers — all within the region we measure.",
    "about.valuesTitle": "How we work",
    "blog.eyebrow": "Insights",
    "blog.title": "Airplay intelligence, in long form",
    "blog.subtitle":
      "Field notes from the panel: chart mechanics, UPRS compliance, music tech and ad auditing across East Africa.",
    "blog.featured": "Featured",
    "blog.readMore": "Read article",
    "blog.allArticles": "All Articles",
    "blog.minutes": "{n} min read",
    "charts.eyebrow": "National Top 100",
    "charts.title": "Uganda airplay chart — week of {week}",
    "charts.subtitle":
      "Captured spins from the connected FM panel over the last seven reporting days. Tap any row to hear its 10-second evidence snippet.",
    "charts.region": "Region",
    "charts.all": "All",
    "charts.spins": "Spins 7d",
    "charts.prev": "Prev 7d",
    "charts.peak": "Peak",
    "charts.weeks": "Weeks",
    "charts.confidence": "Confidence",
    "charts.movingUp": "Up {n}",
    "charts.movingDown": "Down {n}",
    "charts.newEntry": "New entry",
    "charts.evidence": "Evidence",
    "charts.search": "Search the chart",
    "charts.note":
      "Rankings reflect captured plays in the connected panel, not all Ugandan broadcasts. All-time peak positions are unknown for production releases.",
    "footer.tagline":
      "Measuring East African airplay, one confirmed spin at a time.",
    "footer.product": "Product",
    "footer.solutions": "Solutions",
    "footer.company": "Company",
    "footer.resources": "Resources",
    "footer.rights": "© 2026 East Sound. Built in Kampala, Uganda.",
    "footer.disclaimer":
      "Illustrative panel data for product demonstration. Not an independent national chart or a UCC licence record.",
  },
  sw: {
    "nav.useCases": "Tumia",
    "nav.solutions": "Suluhisho",
    "nav.about": "Kuhusu",
    "nav.insights": "Mawazo",
    "nav.accessPortal": "Portali",
    "nav.signIn": "Ingia",
    "nav.signOut": "Toka",
    "nav.language": "Lugha",
    "nav.openMenu": "Gawanya menu",
    "nav.closeMenu": "Funga menu",
    "nav.brand": "East Sound",
    "nav.tagline": "Takwimu za Muziki wa Kisoko cha Africa Mashariki",
    "hero.eyebrow": "Hatua za muziki kwanza",
    "hero.title": "Muziki Kwanza. Uwazi Kwanza.",
    "hero.subtitle":
      "East Sound hupanga muziki wa kisoko cha FM Uganda na kumwezesha mtu, lebo, kituo na shirika moja tu ya msingi kwa kila sanisi.",
    "hero.ctaCharts": "Tazama Makundi ya Kisoko",
    "hero.ctaPilot": "Ufikiaji wa Kituo",
    "hero.builtFor": "Built for East Africa — UG · KE · TZ · RW",
    "tiers.eyebrow": "Chagua eneo la kazi",
    "tiers.title": "Mfumo mmoja, majukumu manne",
    "tiers.subtitle":
      "Chagua aina inayofaa kazi yako — kutoka kwenye makundi hadi kukusanya malipo ya royalti.",
    "tiers.openTier": "Fungua {tier}",
    "monitor.title": "MKINISHO WA KISOKO CHA SAA",
    "monitor.subtitle": "Sanisi za muziki kutoka kwenye kisoko cha FM cha Kampala",
    "monitor.stations": "Vitio {count} Vipo Kino",
    "monitor.ping": "{station} · {track} — {artist}",
    "monitor.empty": "Inasubiri sanisi inayofuata…",
    "monitor.confidence": "uhakika wa mechi",
    "monitor.evidence": "usiki wa sekunde 10",
    "monitor.recent": "Sanisi za karibuni",
    "monitor.badge": "Feed ya kisoko · mfano",
    "solutions.eyebrow": "Mfumo wa kufanya kazi",
    "solutions.title": "Safu ya BMAT, built kwa eneo",
    "solutions.subtitle":
      "Vericast, Reportal, ReSol, makundi ya kitaifa na AD Control — module za biashara ya muziki ya eneo.",
    "about.eyebrow": "Kuhusu East Sound",
    "about.title": "Kutoka studio ya Kampala hadi kisoko cha eneo",
    "about.subtitle":
      "East Sound ilianza ndani ya 7H Music Group. Leo kisoko cha FM kinakusanya malipo na kuorodhesha kundi la taifa.",
    "about.statsTitle": "Takwimu za lengo",
    "about.teamTitle": "Timu inayolinda ukweli wa kisoko",
    "about.teamSubtitle":
      "Wazalishaji, wahandisi, wakaguzi na wachambuzi wa makundi — wote kwenye eneo tunalolipimia.",
    "about.valuesTitle": "Tunavyofanya kazi",
    "blog.eyebrow": "Mawazo",
    "blog.title": "Hatua za kisoko, kwa undani",
    "blog.subtitle":
      "Masomo kutoka kwenye kisoko: kanuni za makundi, UPRS, teknolojia ya muziki na ukaguzi wa matangazo.",
    "blog.featured": "Inaonekana",
    "blog.readMore": "Soma makala",
    "blog.allArticles": "Makala zote",
    "blog.minutes": "dakika {n} za kusoma",
    "charts.eyebrow": "Kundi la Taifa la 100",
    "charts.title": "Kundi la kisoko cha Uganda — wiki ya {week}",
    "charts.subtitle":
      "Sanisi zilizokusanya kutoka kisoko cha FM katika siku saba zilizopita. Gwasia kila safu kusikia usiki wa sekunde 10.",
    "charts.region": "Eneo",
    "charts.all": "Zote",
    "charts.spins": "Sanisi 7d",
    "charts.prev": "7d Iliyopita",
    "charts.peak": "Ki चोटi",
    "charts.weeks": "Wiki",
    "charts.confidence": "Uhakika",
    "charts.movingUp": "Panda {n}",
    "charts.movingDown": "Potea {n}",
    "charts.newEntry": "Imerudia",
    "charts.evidence": "U evidence",
    "charts.search": "Tafuta kwenye kundi",
    "charts.note":
      "Maorodheshi yanahusu sanisi zilizokusanya kwenye kisoko, si matangazo yote ya Uganda.",
    "footer.tagline":
      "Kupima muziki wa Africa Mashariki, sanisi moja iliyohakikishwa baada ya nyingine.",
    "footer.product": "Bidhaa",
    "footer.solutions": "Suluhisho",
    "footer.company": "Kampuni",
    "footer.resources": "Rasilimali",
    "footer.rights": "© 2026 East Sound. Ilijengwa Kampala, Uganda.",
    "footer.disclaimer":
      "Data ya kisoko ya mfano kwa maandalizi ya bidhaa. Si kundi la taifa la kujitegemea wala hati ya UCC.",
  },
  lu: {
    "nav.useCases": "Nteera",
    "nav.solutions": "Enkola",
    "nav.about": "Kukira",
    "nav.insights": "Amaliri",
    "nav.accessPortal": "Lubiri",
    "nav.signIn": "Kuyingila",
    "nav.signOut": "Kuvaa",
    "nav.language": "Lulimi",
    "nav.openMenu": "Yingila menu",
    "nav.closeMenu": "Ggyamya menu",
    "nav.brand": "East Sound",
    "nav.tagline": "Amaliri ga muziki gwa East Africa",
    "hero.eyebrow": "Muziki gwokolo",
    "hero.title": "Muziki Kwanza. Obuwakizi Kwanza.",
    "hero.subtitle":
      "East Sound galinga muziki gwa radio za FM za Uganda n'okussibirira abasomi, leeti, radio ne ssssibo lya ssematu mu kyokuzibwa kwe kupiga.",
    "hero.ctaCharts": "Talanya ku List za Muziki",
    "hero.ctaPilot": "Kuyingila Radio",
    "hero.builtFor": "Built for East Africa — UG · KE · TZ · RW",
    "tiers.eyebrow": "choicework yako",
    "tiers.title": "Enkola emu, bipi omuka",
    "tiers.subtitle":
      "Picka tier nga ggwanyo okusobola okukola — okuva ku list za muziki okutuuka ku kussa nsimbi.",
    "tiers.openTier": "Yingila {tier}",
    "monitor.title": "LIVE STREAM MONITOR",
    "monitor.subtitle": "Kusika kw'ebiga ku radio za FM za Kampala",
    "monitor.stations": "Radio {count} Zisinga",
    "monitor.ping": "{station} · {track} — {artist}",
    "monitor.empty": "Ebyo nga biwedde…",
    "monitor.confidence": "obutasoboka",
    "monitor.evidence": "ennyi gwa 10",
    "monitor.recent": "Ebiri bizze",
    "monitor.badge": "Panel feed · omulere",
    "solutions.eyebrow": "Enkola y'okukola",
    "solutions.title": "Suite ya BMAT, eddirirwa mu region",
    "solutions.subtitle":
      "Vericast, Reportal, ReSol, list za nsi n'AD Control — bikulu by'obwerere bwa muziki.",
    "about.eyebrow": "Kukira East Sound",
    "about.title": "Okuva studio ya Kampala okutuuka ku radio za region",
    "about.subtitle":
      "East Sound yabeana mu 7H Music Group. Kale panel ya FM essibira nsimbi ne list enkulu.",
    "about.statsTitle": "Amaliri g'obwerere",
    "about.teamTitle": "Ttbiitge okukuuma obutege",
    "about.teamSubtitle":
      "Abalizzi, abawezi, abakugu n'aberebu bwa list — bonna mu region tutebera.",
    "about.valuesTitle": "Tukoze nga",
    "blog.eyebrow": "Amaliri",
    "blog.title": "Amaliri g'ebiga, mu ntiisa",
    "blog.subtitle":
      "Okuteeka mu panel: enkola za list, UPRS, ebyobulimi bya muziki n'okukuba ebiga.",
    "blog.featured": "Ensinze",
    "blog.readMore": "Soma essaeya",
    "blog.allArticles": "Ensaeya zonna",
    "blog.minutes": "{n} dakika",
    "charts.eyebrow": "List enkulu 100",
    "charts.title": "List ya muziki gwa Uganda — ssaza ya {week}",
    "charts.subtitle":
      "Ebiri byokusanya okuva ku radio za FM mu kinnaku 7. Yingila eri n'okuwulira ennyi gwa 10.",
    "charts.region": "Ssaza",
    "charts.all": "Bonna",
    "charts.spins": "Spins 7d",
    "charts.prev": "7d Edda",
    "charts.peak": "Ekigo",
    "charts.weeks": "Ssazi",
    "charts.confidence": "Obwo",
    "charts.movingUp": "Nnyuka {n}",
    "charts.movingDown": "Nnona {n}",
    "charts.newEntry": "Mukutte",
    "charts.evidence": "Kuwulirira",
    "charts.search": "Tebca list",
    "charts.note":
      "Ebikwatabirirwa byokka mu panel, si byonna bya radio za Uganda.",
    "footer.tagline":
      "Okubala muziki gwa East Africa, eri emu n'emu nga epya epya.",
    "footer.product": "Ebyobulimi",
    "footer.solutions": "Enkola",
    "footer.company": "Kkampuni",
    "footer.resources": "Ebya okumanya",
    "footer.rights": "© 2026 East Sound. Ezimbibwa Kampala, Uganda.",
    "footer.disclaimer":
      "Data ya panel ku bufumu bwa kikerezi. Si list y'ensi erambira n'license ya UCC.",
  },
};

/** Interpolate `{name}` placeholders, then fall back to English, then the key. */
export function translate(
  lang: SiteLanguage,
  key: string,
  params?: Record<string, string | number>,
): string {
  const dict = TRANSLATIONS[lang] ?? TRANSLATIONS.en;
  let text = dict[key] ?? TRANSLATIONS.en[key] ?? key;
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      text = text.replaceAll(`{${name}}`, String(value));
    }
  }
  return text;
}
