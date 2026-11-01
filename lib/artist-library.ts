import { csvRows } from "@/lib/csv";

/** Public release research, not a master delivery, rights registration or airplay observation. */
export const MUSIC_RESEARCHED_ON = "2026-11-01";
export const MUSIC_REFERENCE_NOTICE =
  "Public release references only. Listening is provided by the original platform. No master licence, ownership split, verified ISRC or observed airplay is supplied by this research.";

export const MUSIC_SOURCES = {
  "baranga-profile": {
    title: "Baranga artist catalogue",
    publisher: "Apple Music",
    url: "https://music.apple.com/ug/artist/baranga/1764683984",
  },
  "fallback-profile": {
    title: "Mr fallback artist catalogue",
    publisher: "Apple Music",
    url: "https://music.apple.com/ug/artist/mr-fallback/1795137555",
  },
  "soundlykbb-profile": {
    title: "Soundlykbb artist catalogue",
    publisher: "Apple Music",
    url: "https://music.apple.com/ug/artist/soundlykbb/1690023792",
  },
  "tai-dai-profile": {
    title: "Tai Dai artist catalogue",
    publisher: "Apple Music",
    url: "https://music.apple.com/ug/artist/tai-dai/1426402603",
  },
  salo: {
    title: "SALO — single metadata",
    publisher: "Apple Music",
    url: "https://music.apple.com/ug/album/salo-single/1764794748",
  },
  chapters: {
    title: "CHAPTERS I NEVER WROTE — track list and credits",
    publisher: "Apple Music",
    url: "https://music.apple.com/ug/album/chapters-i-never-wrote/6768973076",
  },
  ekibobo: {
    title: "Ekibobo — 4 March 2025 edition",
    publisher: "Apple Music",
    url: "https://music.apple.com/ug/album/ekibobo-single/1800333010",
  },
  abeyoo: {
    title: "Abeyoo (feat. Sopreno C) — single metadata",
    publisher: "Apple Music",
    url: "https://music.apple.com/ug/album/abeyoo-feat-sopreno-c-single/1885183494",
  },
  sponsor: {
    title: "Sponsor — joint artist credits",
    publisher: "Apple Music",
    url: "https://music.apple.com/ug/album/sponsor-single/6817897466",
  },
  "ola-mummy": {
    title: "OLA MUMMY — single metadata",
    publisher: "Apple Music",
    url: "https://music.apple.com/ug/album/ola-mummy-single/1788711313",
  },
  "made-in-entebbe": {
    title: "MADE IN ENTEBBE — EP and joint track credits",
    publisher: "Apple Music",
    url: "https://music.apple.com/ug/album/made-in-entebbe-ep/1690048888",
  },
  whet: {
    title: "WHET — EP and joint track credits",
    publisher: "Apple Music",
    url: "https://music.apple.com/ug/album/whet-ep/6782961962",
  },
  "outside-shoes": {
    title: "Outside Shoes — single metadata",
    publisher: "Apple Music",
    url: "https://music.apple.com/ug/album/outside-shoes-single/1805030740",
  },
  unforgettable: {
    title: "UNFORGETTABLE — original single edition",
    publisher: "Apple Music",
    url: "https://music.apple.com/ug/album/unforgettable-single/6768396763",
  },
  thursday: {
    title: "Thursday — joint artist credits and release metadata",
    publisher: "Apple Music",
    url: "https://music.apple.com/ug/album/thursday-single/1814799669",
  },
} as const;

export type MusicSourceId = keyof typeof MUSIC_SOURCES;
export type PublicArtistId =
  | "baranga"
  | "mr-fallback"
  | "soundlykbb"
  | "tai-dai";
export type ArtistSelection = PublicArtistId | "all";

export interface PublicArtist {
  id: PublicArtistId;
  name: string;
  displayName: string;
  initials: string;
  tagline: string;
  /** Original short summary of the cited catalogue, not an invented personal biography. */
  summary: string;
  genres: readonly string[];
  sourceIds: readonly MusicSourceId[];
  highlightRecordingId: string;
}

export interface ReferenceRecording {
  id: string;
  title: string;
  /** Preserve co-leads; do not silently turn a joint artist into a featured artist. */
  primaryArtists: readonly string[];
  featuredArtists: readonly string[];
  artistIds: readonly PublicArtistId[];
  release: string;
  releaseType: "Single" | "EP" | "Album";
  releaseDate: string;
  durationSec: number;
  genre: string;
  /** Platform's published phonogram line; not proof of ownership or a licence to East Sound. */
  phonogramCredit: string;
  appleMusicUrl: string;
  sourceId: MusicSourceId;
  /** Intentionally unknown. Never allocate demo ISRCs to a real published recording. */
  isrc: null;
  usage: "public-reference";
}

export const PUBLIC_ARTISTS: readonly PublicArtist[] = [
  {
    id: "baranga",
    name: "Baranga",
    displayName: "BARANGA",
    initials: "BA",
    tagline: "SALO to CHAPTERS I NEVER WROTE",
    summary:
      "Baranga’s catalogue includes the Afro-Beat single SALO (2024) and the seven-track CHAPTERS I NEVER WROTE (2026). The album credits MR FALLBACK on BREATHE and WAGWUAN, alongside other collaborators.",
    genres: ["Afro-Beat"],
    sourceIds: ["baranga-profile", "salo", "chapters"],
    highlightRecordingId: "baranga-salo",
  },
  {
    id: "mr-fallback",
    name: "Mr fallback",
    displayName: "MR FALLBACK",
    initials: "MF",
    tagline: "Solo releases. Shared records.",
    summary:
      "Mr fallback’s public releases include Ekibobo (2025) and Abeyoo featuring Sopreno C (2026). MR FALLBACK is also credited as a featured artist on Baranga’s BREATHE and WAGWUAN. These links point to the same catalogue identity, not similarly named artists.",
    genres: ["Afro-Pop"],
    sourceIds: ["fallback-profile", "ekibobo", "abeyoo", "chapters"],
    highlightRecordingId: "fallback-abeyoo",
  },
  {
    id: "soundlykbb",
    name: "Soundlykbb",
    displayName: "SOUNDLYKBB",
    initials: "BB",
    tagline: "MADE IN ENTEBBE and beyond",
    summary:
      "Soundlykbb’s releases include MADE IN ENTEBBE (2023) and OLA MUMMY (2025). Joint credits include Khxli on BUNDA FREESTYLE, Kaboo and Tai Dai on Thursday, and Denim Cartel and Big Tril on Sponsor (2026).",
    genres: ["Afro-Beat", "Afrobeats", "Worldwide"],
    sourceIds: [
      "soundlykbb-profile",
      "made-in-entebbe",
      "ola-mummy",
      "sponsor",
      "thursday",
    ],
    highlightRecordingId: "soundlykbb-ola-mummy",
  },
  {
    id: "tai-dai",
    name: "Tai Dai",
    displayName: "TAI DAI",
    initials: "TD",
    tagline: "Outside Shoes. WHET. A wider palette.",
    summary:
      "Tai Dai’s catalogue spans Alternative and Electronic releases, including Outside Shoes (2025), UNFORGETTABLE (2026) and WHET (2026). GRANTED credits Tai Dai with Lukorito; Thursday is a joint release with Kaboo and Soundlykbb.",
    genres: ["Alternative", "Electronic", "Afrobeats"],
    sourceIds: [
      "tai-dai-profile",
      "outside-shoes",
      "unforgettable",
      "whet",
      "thursday",
    ],
    highlightRecordingId: "tai-dai-outside-shoes",
  },
];

export const REFERENCE_RECORDINGS: readonly ReferenceRecording[] = [
  {
    id: "baranga-salo",
    title: "SALO",
    primaryArtists: ["Baranga"],
    featuredArtists: [],
    artistIds: ["baranga"],
    release: "SALO - Single",
    releaseType: "Single",
    releaseDate: "2024-08-24",
    durationSec: 154,
    genre: "Afro-Beat",
    phonogramCredit: "℗ 2024 5844655 Records DK",
    appleMusicUrl:
      "https://music.apple.com/ug/album/salo/1764794748?i=1764795019",
    sourceId: "salo",
    isrc: null,
    usage: "public-reference",
  },
  {
    id: "baranga-breathe",
    title: "BREATHE (feat. MR FALLBACK)",
    primaryArtists: ["Baranga"],
    featuredArtists: ["MR FALLBACK"],
    artistIds: ["baranga", "mr-fallback"],
    release: "CHAPTERS I NEVER WROTE",
    releaseType: "Album",
    releaseDate: "2026-05-08",
    durationSec: 196,
    genre: "Afro-Beat",
    phonogramCredit: "℗ 2026 5844655 Records DK",
    appleMusicUrl:
      "https://music.apple.com/ug/album/breathe-feat-mr-fallback/6768973076?i=6768973082",
    sourceId: "chapters",
    isrc: null,
    usage: "public-reference",
  },
  {
    id: "baranga-wagwuan",
    title: "WAGWUAN (feat. MR FALLBACK & MELLAN KUNTA)",
    primaryArtists: ["Baranga"],
    featuredArtists: ["MR FALLBACK", "MELLAN KUNTA"],
    artistIds: ["baranga", "mr-fallback"],
    release: "CHAPTERS I NEVER WROTE",
    releaseType: "Album",
    releaseDate: "2026-05-08",
    durationSec: 192,
    genre: "Afro-Beat",
    phonogramCredit: "℗ 2026 5844655 Records DK",
    appleMusicUrl:
      "https://music.apple.com/ug/album/wagwuan-feat-mr-fallback-mellan-kunta/6768973076?i=6768973079",
    sourceId: "chapters",
    isrc: null,
    usage: "public-reference",
  },
  {
    id: "fallback-ekibobo",
    title: "Ekibobo",
    primaryArtists: ["Mr fallback"],
    featuredArtists: [],
    artistIds: ["mr-fallback"],
    release: "Ekibobo - Single",
    releaseType: "Single",
    releaseDate: "2025-03-04",
    durationSec: 161,
    genre: "Afro-Pop",
    phonogramCredit: "℗ 2025 7615771 Records DK",
    appleMusicUrl:
      "https://music.apple.com/ug/album/ekibobo/1800333010?i=1800333011",
    sourceId: "ekibobo",
    isrc: null,
    usage: "public-reference",
  },
  {
    id: "fallback-abeyoo",
    title: "Abeyoo (feat. Sopreno C)",
    primaryArtists: ["Mr fallback"],
    featuredArtists: ["Sopreno C"],
    artistIds: ["mr-fallback"],
    release: "Abeyoo (feat. Sopreno C) - Single",
    releaseType: "Single",
    releaseDate: "2026-03-13",
    durationSec: 136,
    genre: "Afro-Pop",
    phonogramCredit: "℗ 2026 7615771 Records DK",
    appleMusicUrl:
      "https://music.apple.com/ug/album/abeyoo-feat-sopreno-c/1885183494?i=1885183496",
    sourceId: "abeyoo",
    isrc: null,
    usage: "public-reference",
  },
  {
    id: "soundlykbb-sponsor",
    title: "Sponsor",
    primaryArtists: ["Denim Cartel", "Soundlykbb", "Big Tril"],
    featuredArtists: [],
    artistIds: ["soundlykbb"],
    release: "Sponsor - Single",
    releaseType: "Single",
    releaseDate: "2026-10-21",
    durationSec: 211,
    genre: "Afrobeats",
    phonogramCredit: "℗ 2026 DENIM CARTEL",
    appleMusicUrl:
      "https://music.apple.com/ug/album/sponsor/6817897466?i=6817897470",
    sourceId: "sponsor",
    isrc: null,
    usage: "public-reference",
  },
  {
    id: "soundlykbb-ola-mummy",
    title: "OLA MUMMY",
    primaryArtists: ["Soundlykbb"],
    featuredArtists: [],
    artistIds: ["soundlykbb"],
    release: "OLA MUMMY - Single",
    releaseType: "Single",
    releaseDate: "2025-01-17",
    durationSec: 179,
    genre: "Afro-Beat",
    phonogramCredit: "℗ 2025 Milla Sound",
    appleMusicUrl:
      "https://music.apple.com/ug/album/ola-mummy/1788711313?i=1788711314",
    sourceId: "ola-mummy",
    isrc: null,
    usage: "public-reference",
  },
  {
    id: "soundlykbb-bunda-freestyle",
    title: "BUNDA FREESTYLE",
    primaryArtists: ["Soundlykbb", "Khxli"],
    featuredArtists: [],
    artistIds: ["soundlykbb"],
    release: "MADE IN ENTEBBE - EP",
    releaseType: "EP",
    releaseDate: "2023-06-02",
    durationSec: 158,
    genre: "Worldwide",
    phonogramCredit: "℗ 2023 Milla Sound",
    appleMusicUrl:
      "https://music.apple.com/ug/album/bunda-freestyle/1690048888?i=1690048891",
    sourceId: "made-in-entebbe",
    isrc: null,
    usage: "public-reference",
  },
  {
    id: "tai-dai-outside-shoes",
    title: "Outside Shoes",
    primaryArtists: ["Tai Dai"],
    featuredArtists: [],
    artistIds: ["tai-dai"],
    release: "Outside Shoes - Single",
    releaseType: "Single",
    releaseDate: "2025-05-01",
    durationSec: 167,
    genre: "Alternative",
    phonogramCredit: "℗ 2025 Tai Dai Official",
    appleMusicUrl:
      "https://music.apple.com/ug/album/outside-shoes/1805030740?i=1805030741",
    sourceId: "outside-shoes",
    isrc: null,
    usage: "public-reference",
  },
  {
    id: "tai-dai-granted",
    title: "GRANTED",
    primaryArtists: ["Tai Dai", "Lukorito"],
    featuredArtists: [],
    artistIds: ["tai-dai"],
    release: "WHET - EP",
    releaseType: "EP",
    releaseDate: "2026-07-23",
    durationSec: 144,
    genre: "Alternative",
    phonogramCredit: "℗ 2026 Tai Dai Official",
    appleMusicUrl:
      "https://music.apple.com/ug/album/granted/6782961962?i=6782962099",
    sourceId: "whet",
    isrc: null,
    usage: "public-reference",
  },
  {
    id: "tai-dai-unforgettable",
    title: "UNFORGETTABLE",
    primaryArtists: ["Tai Dai"],
    featuredArtists: [],
    artistIds: ["tai-dai"],
    release: "UNFORGETTABLE - Single",
    releaseType: "Single",
    releaseDate: "2026-06-05",
    durationSec: 110,
    genre: "Electronic",
    phonogramCredit: "℗ 2026 Tai Dai Official",
    appleMusicUrl:
      "https://music.apple.com/ug/album/unforgettable/6768396763?i=6768396767",
    sourceId: "unforgettable",
    isrc: null,
    usage: "public-reference",
  },
  {
    id: "thursday",
    title: "Thursday",
    primaryArtists: ["Kaboo", "Tai Dai", "Soundlykbb"],
    featuredArtists: [],
    artistIds: ["tai-dai", "soundlykbb"],
    release: "Thursday - Single",
    releaseType: "Single",
    releaseDate: "2024-01-18",
    durationSec: 196,
    genre: "Afrobeats",
    phonogramCredit:
      "℗ 2024 Kaboo under exclusive license to Home Crowd Recordings, a division of Mouthwatering Records",
    appleMusicUrl:
      "https://music.apple.com/ug/album/thursday/1814799669?i=1814799670",
    sourceId: "thursday",
    isrc: null,
    usage: "public-reference",
  },
];

export function isPublicArtistId(value: string): value is PublicArtistId {
  return PUBLIC_ARTISTS.some((artist) => artist.id === value);
}

export function artistSelectionFromHash(hash: string): ArtistSelection {
  try {
    const value = decodeURIComponent(hash.replace(/^#/, ""));
    return isPublicArtistId(value) ? value : "all";
  } catch {
    return "all";
  }
}

const normaliseSearch = (value: string) =>
  value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
export function filterReferenceRecordings({
  artist = "all",
  query = "",
  sort = "recent",
}: {
  artist?: ArtistSelection;
  query?: string;
  sort?: "recent" | "title";
} = {}): ReferenceRecording[] {
  const terms = normaliseSearch(query).split(/\s+/).filter(Boolean);
  return REFERENCE_RECORDINGS.filter((recording) => {
    if (artist !== "all" && !recording.artistIds.includes(artist)) return false;
    const searchable = normaliseSearch(
      [
        recording.title,
        ...recording.primaryArtists,
        ...recording.featuredArtists,
        recording.release,
        recording.genre,
      ].join(" "),
    );
    return terms.every((term) => searchable.includes(term));
  }).sort((a, b) =>
    sort === "title"
      ? a.title.localeCompare(b.title)
      : b.releaseDate.localeCompare(a.releaseDate) ||
        a.title.localeCompare(b.title),
  );
}

/** Only allow the researched Uganda Apple Music song links; never arbitrary iframe URLs. */
export function appleMusicEmbedUrl(publicUrl: string): string | null {
  try {
    const url = new URL(publicUrl);
    const trackId = url.searchParams.get("i") ?? "";
    if (
      url.origin !== "https://music.apple.com" ||
      !/^\/ug\/album\/[^/]+\/\d+$/.test(url.pathname) ||
      !/^\d+$/.test(trackId) ||
      url.username ||
      url.password
    )
      return null;
    const embed = new URL(url.pathname, "https://embed.music.apple.com");
    embed.searchParams.set("i", trackId);
    embed.searchParams.set("theme", "light");
    return embed.toString();
  } catch {
    return null;
  }
}

export function referenceMusicCsv(
  recordings: readonly ReferenceRecording[],
): string {
  return csvRows([
    [
      "Title",
      "Primary artist credits",
      "Featured artist credits",
      "Release",
      "Release date",
      "Duration seconds",
      "Genre",
      "Published phonogram credit",
      "ISRC (not verified)",
      "Apple Music",
      "Metadata source",
      "Researched on",
      "Usage",
    ],
    ...recordings.map((recording) => [
      recording.title,
      recording.primaryArtists.join("; "),
      recording.featuredArtists.join("; "),
      recording.release,
      recording.releaseDate,
      recording.durationSec,
      recording.genre,
      recording.phonogramCredit,
      recording.isrc,
      recording.appleMusicUrl,
      MUSIC_SOURCES[recording.sourceId].url,
      MUSIC_RESEARCHED_ON,
      MUSIC_REFERENCE_NOTICE,
    ]),
  ]);
}
