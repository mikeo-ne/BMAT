export const MAX_UPLOAD_BYTES = 80 * 1024 * 1024;

export const ACCEPTED_AUDIO: Record<string, { format: "MP3" | "WAV"; mime: string }> = {
  mp3: { format: "MP3", mime: "audio/mpeg" },
  wav: { format: "WAV", mime: "audio/wav" },
};

export interface StagedFileIssue {
  fileName: string;
  reason: string;
}

export interface StagedFile {
  /** Client-side id, stable for the lifetime of the staged upload. */
  id: string;
  file: File;
  fileName: string;
  sizeBytes: number;
  format: "MP3" | "WAV";
  mimeType: string;
  durationSec: number | null;
  /** Blob URL for the in-browser preview player. */
  previewUrl: string;
}

export function extensionOf(fileName: string): string {
  const idx = fileName.lastIndexOf(".");
  return idx === -1 ? "" : fileName.slice(idx + 1).toLowerCase();
}

/**
 * Guards the dropzone: only MP3/WAV, and nothing absurdly large.
 * Returns a reason string when the file must be rejected, null when accepted.
 */
export function validateAudioFile(file: { name: string; size: number; type?: string }): string | null {
  const ext = extensionOf(file.name);
  const accepted = ACCEPTED_AUDIO[ext];

  if (!accepted) {
    const looksLikeAudio = (file.type ?? "").startsWith("audio/");
    return looksLikeAudio
      ? `"${file.name}" is audio but not MP3 or WAV — transcode before delivering.`
      : `"${file.name}" is not an audio file. Drop MP3 or WAV masters only.`;
  }

  if (file.size === 0) {
    return `"${file.name}" is empty (0 bytes).`;
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return `"${file.name}" is ${(file.size / 1048576).toFixed(1)} MB — the 80 MB ceiling is exceeded.`;
  }

  return null;
}

/**
 * Best-effort "Artist - Title.mp3" parse used to prefill the metadata form when
 * a file is dropped. Returns empty strings when the name carries no separator.
 */
export function parseFileName(
  fileName: string,
): { title: string; primaryArtist: string; featuredArtists: string[] } {
  const stem = fileName.replace(/\.[^.]+$/, "").replace(/[_]+/g, " ").trim();

  const sep = stem.split(/\s+[-–—]\s+/);
  if (sep.length >= 2) {
    const [artist, ...rest] = sep;
    let title = rest.join(" - ").trim();
    let featured: string[] = [];

    const featMatch = title.match(/\s*[\[(]\s*(?:ft\.?|feat\.?|featuring)\s+([^)\]]+)\s*[\])]\s*$/i);
    if (featMatch) {
      featured = splitArtists(featMatch[1]);
      title = title.slice(0, featMatch.index).trim();
    }

    return { title, primaryArtist: artist.trim(), featuredArtists: featured };
  }

  const bracket = stem.match(/\s*[\[(]\s*(?:ft\.?|feat\.?|featuring)\s+([^)\]]+)\s*[\])]\s*$/i);
  if (bracket) {
    return {
      title: stem.slice(0, bracket.index).trim(),
      primaryArtist: "",
      featuredArtists: splitArtists(bracket[1]),
    };
  }

  return { title: stem, primaryArtist: "", featuredArtists: [] };
}

/** "A, B & C" / "A;B" / "A x B" -> ["A","B","C"] */
export function splitArtists(value: string): string[] {
  if (!value) return [];
  return value
    .split(/\s*(?:,|;|&|\band\b|\bx\b|\/)\s*/i)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Reads duration + a stable client id from a File via an <audio> element. */
export function probeAudio(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    const cleanup = () => URL.revokeObjectURL(url);

    const timer = setTimeout(() => {
      cleanup();
      resolve(null);
    }, 8000);

    audio.preload = "metadata";
    audio.onloadedmetadata = () => {
      clearTimeout(timer);
      const duration = Number.isFinite(audio.duration) ? audio.duration : null;
      cleanup();
      resolve(duration);
    };
    audio.onerror = () => {
      clearTimeout(timer);
      cleanup();
      resolve(null);
    };
    audio.src = url;
  });
}
