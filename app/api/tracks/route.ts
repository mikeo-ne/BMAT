import { NextResponse } from "next/server";

import { suggestIsrc } from "@/lib/catalog";
import { checkIsrc } from "@/lib/isrc";
import { isValidIsoDate } from "@/lib/format";
import {
  ACCEPTED_AUDIO,
  MAX_UPLOAD_BYTES,
  extensionOf,
  splitArtists,
} from "@/lib/upload";
import { addTrack, readTracks, saveUpload } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const tracks = await readTracks();
  return NextResponse.json({ tracks });
}

interface FieldErrors {
  title?: string;
  primaryArtist?: string;
  releaseDate?: string;
  isrc?: string;
  audio?: string;
}

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected a multipart/form-data request." }, { status: 400 });
  }

  const title = String(form.get("title") ?? "").trim();
  const primaryArtist = String(form.get("primaryArtist") ?? "").trim();
  const releaseDate = String(form.get("releaseDate") ?? "").trim();
  const rawIsrc = String(form.get("isrc") ?? "").trim();
  const featured = splitArtists(String(form.get("featuredArtists") ?? ""));
  const durationRaw = form.get("durationSec");
  const durationSec =
    durationRaw === null || durationRaw === "" || Number.isNaN(Number(durationRaw))
      ? null
      : Math.max(0, Number(durationRaw));

  const file = form.get("audio");
  const errors: FieldErrors = {};

  if (title.length < 1) errors.title = "Song title is required.";
  if (primaryArtist.length < 1) errors.primaryArtist = "Primary artist is required.";
  if (!isValidIsoDate(releaseDate)) errors.releaseDate = "Use a valid release date (YYYY-MM-DD).";

  const isrcCheck = checkIsrc(rawIsrc);
  if (!isrcCheck.valid || !isrcCheck.canonical) {
    errors.isrc = isrcCheck.message;
  }

  if (!(file instanceof File)) {
    errors.audio = "Attach an MP3 or WAV master.";
  } else {
    const ext = extensionOf(file.name);
    if (!ACCEPTED_AUDIO[ext]) {
      errors.audio = "Only MP3 and WAV masters are accepted.";
    } else if (file.size === 0) {
      errors.audio = "The file is empty.";
    } else if (file.size > MAX_UPLOAD_BYTES) {
      errors.audio = `File exceeds the ${MAX_UPLOAD_BYTES / 1048576} MB ceiling.`;
    }
  }

  if (Object.keys(errors).length > 0) {
    return NextResponse.json({ error: "Delivery rejected.", errors }, { status: 422 });
  }

  const audioFile = file as File;
  const ext = extensionOf(audioFile.name) as "mp3" | "wav";
  const meta = ACCEPTED_AUDIO[ext];
  const buffer = Buffer.from(await audioFile.arrayBuffer());
  const storedName = await saveUpload(buffer, audioFile.name);

  const track = await addTrack({
    title,
    primaryArtist,
    featuredArtists: featured,
    releaseDate,
    isrc: isrcCheck.canonical as string,
    fileName: audioFile.name,
    format: meta.format,
    mimeType: audioFile.type || meta.mime,
    sizeBytes: audioFile.size,
    durationSec,
    storedName,
  });

  return NextResponse.json({ track }, { status: 201 });
}

/** Next free ISRC in a registrant's year block — backs the generator button. */
export async function PUT(request: Request) {
  const { searchParams } = new URL(request.url);
  const registrant = searchParams.get("registrant") ?? "";
  const releaseDate = searchParams.get("releaseDate") ?? "";

  if (releaseDate && !isValidIsoDate(releaseDate)) {
    return NextResponse.json({ error: "Invalid release date." }, { status: 400 });
  }

  const existing = await readTracks();
  const isrc = suggestIsrc(
    existing,
    registrant,
    isValidIsoDate(releaseDate) ? releaseDate : new Date().toISOString().slice(0, 10),
  );

  return NextResponse.json({ isrc });
}
