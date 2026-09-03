/**
 * ISRC (International Standard Recording Code) helpers.
 *
 * Shape: CC-XXX-YY-NNNNN
 *   CC     ISO 3166-1 alpha-2 country code  -> "UG" for Uganda
 *   XXX    registrant code (alphanumeric, assigned to the label/artist)
 *   YY     year of the recording's reference year (2 digits)
 *   NNNNN  5-digit designation, unique within the registrant for that year
 *
 * Reference: IFPI ISRC Handbook. The hyphens are separators only and are not
 * part of the code when it is transmitted; both forms are accepted on input.
 */

export const ISRC_COUNTRY_CODE = "UG";

export const ISRC_PATTERN = /^[A-Z]{2}-?[A-Z0-9]{3}-?\d{2}-?\d{5}$/;

export interface GenerateIsrcInput {
  /** Label, imprint or artist name used to derive a registrant code. */
  registrant?: string;
  /** Release or recording year; defaults to the current year. */
  year?: number;
  /** Next designation number within the registrant/year block (1-99999). */
  designation?: number;
}

/**
 * Derives a 3-character registrant code from a free-text name.
 *
 * Deterministic: the same name always yields the same code, so re-generating an
 * ISRC for the same label does not silently move it to a new registrant block.
 */
export function registrantCode(registrant?: string): string {
  const cleaned = (registrant ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

  if (cleaned.length >= 3) {
    // Prefer the leading letters of the first three words ("Nyege Nyege Tapes"
    // -> "NNT") because that is how imprint codes are conventionally read.
    const initials = (registrant ?? "")
      .toUpperCase()
      .split(/[^A-Za-z0-9]+/)
      .filter(Boolean)
      .map((w) => w[0])
      .join("");

    if (initials.length >= 3) return initials.slice(0, 3);

    const padded = cleaned.padEnd(3, "X");
    return padded.slice(0, 3);
  }

  if (cleaned.length > 0) return cleaned.padEnd(3, "X");

  // No registrant supplied yet -> BMAT placeholder block.
  return "BMT";
}

export function padDesignation(designation: number): string {
  if (!Number.isFinite(designation)) return "00001";
  const clamped = Math.min(99_999, Math.max(1, Math.trunc(designation)));
  return String(clamped).padStart(5, "0");
}

export function twoDigitYear(year: number): string {
  if (!Number.isFinite(year)) {
    return twoDigitYear(new Date().getUTCFullYear());
  }
  const full = Math.trunc(year);
  // Accept both 2-digit (26) and 4-digit (2026) input.
  return String(full >= 100 ? full % 100 : full).padStart(2, "0");
}

/** Builds a canonical, hyphenated ISRC string. */
export function generateIsrc(input: GenerateIsrcInput = {}): string {
  const year = input.year ?? new Date().getUTCFullYear();

  return [
    ISRC_COUNTRY_CODE,
    registrantCode(input.registrant),
    twoDigitYear(year),
    padDesignation(input.designation ?? 1),
  ].join("-");
}

/** Normalises any accepted ISRC spelling to the hyphenated canonical form. */
export function normaliseIsrc(value: string): string | null {
  if (!isValidIsrc(value)) return null;
  const stripped = value.toUpperCase().replace(/[-\s]/g, "");
  return [
    stripped.slice(0, 2),
    stripped.slice(2, 5),
    stripped.slice(5, 7),
    stripped.slice(7, 12),
  ].join("-");
}

export function isValidIsrc(value: string): boolean {
  if (typeof value !== "string") return false;
  return ISRC_PATTERN.test(value.trim().toUpperCase());
}

export interface IsrcCheck {
  valid: boolean;
  canonical: string | null;
  message: string;
}

/** Validation with a human-readable reason, for the metadata form. */
export function checkIsrc(value: string): IsrcCheck {
  const trimmed = (value ?? "").trim();

  if (trimmed.length === 0) {
    return { valid: false, canonical: null, message: "Generate one or paste an existing code." };
  }

  if (!isValidIsrc(trimmed)) {
    return {
      valid: false,
      canonical: null,
      message: "Expected CC-XXX-YY-NNNNN, e.g. UG-BMT-26-00001.",
    };
  }

  const canonical = normaliseIsrc(trimmed);

  if (canonical && !canonical.startsWith(`${ISRC_COUNTRY_CODE}-`)) {
    return {
      valid: true,
      canonical,
      message: `Valid ISRC, but registered outside Uganda (${canonical.slice(0, 2)}).`,
    };
  }

  return { valid: true, canonical, message: "Valid Ugandan ISRC." };
}

/** Splits a canonical ISRC into its constituent parts. */
export function parseIsrc(value: string): {
  country: string;
  registrant: string;
  year: string;
  designation: string;
} | null {
  const canonical = normaliseIsrc(value);
  if (!canonical) return null;

  const [country, registrant, year, designation] = canonical.split("-");
  return { country, registrant, year, designation };
}
