/** One place for what search engines and link previews see. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://eastsound.vercel.app").replace(/\/+$/, "");

export const SITE_NAME = "East Sound Technologies";
export const ORG_NAME = "7H Music Group Ltd";

export const DEFAULT_TITLE = "East Sound Technologies — Radio Airplay Monitoring & Music Royalty Tracking in Uganda";
export const DEFAULT_DESCRIPTION =
  "Track when and where your music plays on Ugandan radio. East Sound monitors stations 24/7, matches songs by audio fingerprint, and gives artists, labels, broadcasters and CMOs timestamped airplay evidence and charts.";

export const KEYWORDS = [
  "radio airplay monitoring Uganda",
  "music royalty tracking",
  "airplay charts Uganda",
  "broadcast monitoring Africa",
  "proof of play",
  "audio fingerprinting",
  "music copyright Uganda",
  "Ugandan music",
  "East African music industry",
  "UPRS royalties",
  "radio song detection",
  "artist airplay report",
  "East Sound Technologies",
  "7H Music Group",
];

export const abs = (path = "/") => `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;

/** Schema.org data so Google understands who we are and what the product is. */
export function siteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": abs("/#org"),
        name: SITE_NAME,
        legalName: ORG_NAME,
        url: SITE_URL,
        logo: abs("/icon.svg"),
        email: "7hmusicgroupug@gmail.com",
        address: { "@type": "PostalAddress", addressLocality: "Kampala", addressCountry: "UG" },
        areaServed: ["UG", "East Africa"],
      },
      {
        "@type": "WebSite",
        "@id": abs("/#website"),
        url: SITE_URL,
        name: SITE_NAME,
        alternateName: ["East Sound", "EastSound"],
        publisher: { "@id": abs("/#org") },
        inLanguage: "en",
      },
      {
        "@type": "SoftwareApplication",
        name: SITE_NAME,
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        url: SITE_URL,
        description: DEFAULT_DESCRIPTION,
        publisher: { "@id": abs("/#org") },
        areaServed: "UG",
      },
    ],
  };
}

/** Safe for a <script type="application/ld+json"> body. */
export const jsonLd = (data: unknown) => JSON.stringify(data).replace(/</g, "\\u003c");

/** Child pages replace openGraph wholesale, so build it from this base. */
export const og = (url: string, title = DEFAULT_TITLE, description = DEFAULT_DESCRIPTION, type: "website" | "article" = "website") => ({
  type,
  siteName: SITE_NAME,
  locale: "en_UG",
  url,
  title,
  description,
});
