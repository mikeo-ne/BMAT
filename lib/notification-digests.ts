import { formatEatClock } from "@/lib/format";
import { eatDate, type BroadcastSpin } from "@/lib/playout";
import { REGIONS, type Region } from "@/lib/regions";
import type { Track } from "@/lib/types";
import type { NotificationPreferences } from "@/lib/notifications";

export type DigestKind = "daily" | "weekly";
export interface AirplayDigest {
  kind: DigestKind;
  generatedAt: string;
  startDay: string;
  endDay: string;
  totalAudited: number;
  matched: number;
  unmatched: number;
  stations: number;
  regions: {
    region: Region;
    spins: number;
    previous: number;
    change: number | null;
  }[];
  tracks: { id: string; title: string; artist: string; spins: number }[];
  topStation: { name: string; spins: number } | null;
  notice: string;
}
export const DIGEST_NOTICE =
  "Captured records in East Sound only, not a national census of radio activity. No capture records does not mean a recording received no airplay. Public releases have no inferred ISRCs, rights shares or audience estimates.";

export function buildAirplayDigest(
  history: BroadcastSpin[],
  catalogue: Track[],
  kind: DigestKind,
  now = new Date(),
): AirplayDigest {
  const today = eatDate(now.toISOString());
  const end = Date.parse(`${today}T00:00:00+03:00`);
  const days = kind === "daily" ? 1 : 7;
  const start = end - days * 86400000;
  const seen = new Set<string>();
  const unique = history.filter((spin) => {
    if (
      spin.source !== "captured" ||
      seen.has(spin.id) ||
      !Number.isFinite(Date.parse(spin.detectedAt)) ||
      Date.parse(spin.detectedAt) > now.getTime()
    )
      return false;
    seen.add(spin.id);
    return true;
  });
  const inWindow = unique.filter(
    (spin) =>
      Date.parse(spin.detectedAt) >= start && Date.parse(spin.detectedAt) < end,
  );
  const matched = inWindow.filter((spin) => !!spin.trackId);
  const previous = unique.filter(
    (spin) =>
      spin.trackId &&
      Date.parse(spin.detectedAt) >= start - days * 86400000 &&
      Date.parse(spin.detectedAt) < start,
  );
  const stationCounts = new Map<string, { name: string; spins: number }>();
  const trackCounts = new Map<string, number>();
  for (const spin of matched) {
    const station = stationCounts.get(spin.stationId) ?? {
      name: spin.stationName,
      spins: 0,
    };
    station.spins++;
    stationCounts.set(spin.stationId, station);
    trackCounts.set(spin.trackId!, (trackCounts.get(spin.trackId!) ?? 0) + 1);
  }
  return {
    kind,
    generatedAt: now.toISOString(),
    startDay: eatDate(new Date(start).toISOString()),
    endDay: eatDate(new Date(end - 1).toISOString()),
    totalAudited: inWindow.length,
    matched: matched.length,
    unmatched: inWindow.length - matched.length,
    stations: new Set(inWindow.map((spin) => spin.stationId)).size,
    regions: REGIONS.map((region) => {
      const count = matched.filter((spin) => spin.region === region).length;
      const prior = previous.filter((spin) => spin.region === region).length;
      return {
        region,
        spins: count,
        previous: prior,
        change: prior ? (count - prior) / prior : null,
      };
    }),
    tracks: [...trackCounts.entries()]
      .map(([id, spins]) => {
        const track = catalogue.find((entry) => entry.id === id);
        const event = matched.find((spin) => spin.trackId === id)!;
        return {
          id,
          title: track?.title ?? event.title ?? "Unknown recording",
          artist:
            track?.primaryArtist ?? event.primaryArtist ?? "Unknown artist",
          spins,
        };
      })
      .sort((a, b) => b.spins - a.spins || a.title.localeCompare(b.title)),
    topStation:
      [...stationCounts.values()].sort(
        (a, b) => b.spins - a.spins || a.name.localeCompare(b.name),
      )[0] ?? null,
    notice: DIGEST_NOTICE,
  };
}
export function digestText(digest: AirplayDigest): string {
  return [
    `EAST SOUND | ${digest.kind === "daily" ? "Daily morning recap" : "Weekly regional trends"}`,
    `${digest.startDay} to ${digest.endDay} | EAT (UTC+03:00)`,
    "",
    `Audited capture records: ${digest.totalAudited}`,
    `Matched music plays: ${digest.matched}`,
    `Unmatched audio flags: ${digest.unmatched}`,
    `Reporting stations: ${digest.stations}`,
    `Top station: ${digest.topStation ? `${digest.topStation.name} (${digest.topStation.spins})` : "Awaiting capture records"}`,
    "",
    "REGIONAL BREAKDOWN | MATCHED PLAYS",
    ...digest.regions.map(
      (row) =>
        `${row.region}: ${row.spins} | prior period: ${row.previous} | change: ${row.change === null ? "No prior baseline" : `${(row.change * 100).toFixed(1)}%`}`,
    ),
    "",
    "RECORDINGS",
    ...(digest.tracks.length
      ? digest.tracks.map((row) => `${row.title} - ${row.artist}: ${row.spins}`)
      : ["No matched capture records in this period."]),
    "",
    digest.notice,
  ].join("\n");
}
/** A worker can call this after the scheduled hour; idempotency is keyed to the EAT day/week. */
export function digestDue(
  kind: DigestKind,
  config: NotificationPreferences,
  now = new Date(),
): boolean {
  const eat = new Date(now.getTime() + 3 * 3600000);
  if (
    !config.email.consent ||
    !config.email.address ||
    eat.getUTCHours() < config.email.hour
  )
    return false;
  return kind === "daily"
    ? config.email.daily
    : config.email.weekly && eat.getUTCDay() === config.email.weeklyDay;
}

/** Genuine, selectable-text PDF. PDF standard fonts use a transliterated Latin fallback; UI/CSV retain Unicode. */
export async function renderDigestPdf(
  digest: AirplayDigest,
): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  pdf.setTitle(`East Sound ${digest.kind} airplay digest - ${digest.endDay}`);
  pdf.setAuthor("East Sound");
  const ascii = (value: string) =>
    value
      .replace(/[øØ]/g, "o")
      .replace(/[–—]/g, "-")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\x20-\x7e\n]/g, "?");
  let page = pdf.addPage([595.28, 841.89]);
  let y = 785;
  const nextPage = () => {
    page = pdf.addPage([595.28, 841.89]);
    y = 785;
  };
  function line(text: string, strong = false, size = 10) {
    const font = strong ? bold : regular;
    const words = ascii(text)
      .split(/\s+/)
      .flatMap((word) => {
        const parts: string[] = [];
        let part = "";
        for (const char of word) {
          if (part && font.widthOfTextAtSize(part + char, size) > 487) {
            parts.push(part);
            part = "";
          }
          part += char;
        }
        if (part) parts.push(part);
        return parts;
      });
    let buffer = "";
    for (const word of words) {
      if (buffer && font.widthOfTextAtSize(`${buffer} ${word}`, size) > 487) {
        if (y < 65) nextPage();
        page.drawText(buffer, {
          x: 54,
          y,
          font,
          size,
          color: rgb(0.16, 0.23, 0.23),
        });
        y -= size + 8;
        buffer = word;
      } else buffer += (buffer ? " " : "") + word;
    }
    if (y < 65) nextPage();
    page.drawText(buffer, {
      x: 54,
      y,
      font,
      size,
      color: strong ? rgb(0.06, 0.43, 0.34) : rgb(0.16, 0.23, 0.23),
    });
    y -= size + 9;
  }
  line("EAST SOUND", true, 22);
  line(
    digest.kind === "daily"
      ? "Daily morning airplay recap"
      : "Weekly regional trend breakdown",
    true,
    15,
  );
  line(`${digest.startDay} to ${digest.endDay} | EAT (UTC+03:00)`, false, 10);
  y -= 12;
  for (const row of digestText(digest).split("\n").slice(3)) {
    if (!row) {
      y -= 9;
      continue;
    }
    line(row, row === row.toUpperCase() && row.length > 4);
  }
  for (const [index, sheet] of pdf.getPages().entries())
    sheet.drawText(
      `East Sound | ${formatEatClock(digest.generatedAt)} | Page ${index + 1} / ${pdf.getPageCount()}`,
      { x: 54, y: 32, size: 8, font: regular, color: rgb(0.4, 0.48, 0.48) },
    );
  return pdf.save();
}
