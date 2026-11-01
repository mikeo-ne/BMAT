import {
  masterUploadsAvailable,
  MASTER_STORAGE_NOTICE,
} from "@/lib/runtime-storage";
import { readAnalyticsTracks } from "@/lib/workspace-data";
import { NextResponse } from "next/server";
import { checkIsrc } from "@/lib/isrc";
import { isValidIsoDate } from "@/lib/format";
import { parseDeliveryOwnership } from "@/lib/delivery-splits";
import {
  ACCEPTED_AUDIO,
  extensionOf,
  hasAudioSignature,
  splitArtists,
  validateAudioFile,
} from "@/lib/upload";
import {
  addTrack,
  DuplicateIsrcError,
  removeUpload,
  reserveIsrc,
  saveUpload,
} from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  return NextResponse.json({ tracks: await readAnalyticsTracks() });
}

export async function POST(request: Request) {
  if (!masterUploadsAvailable())
    return NextResponse.json({ error: MASTER_STORAGE_NOTICE }, { status: 503 });
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected a multipart/form-data request." },
      { status: 400 },
    );
  }
  const title = String(form.get("title") ?? "").trim();
  const primaryArtist = String(form.get("primaryArtist") ?? "").trim();
  const releaseDate = String(form.get("releaseDate") ?? "").trim();
  const isrcCheck = checkIsrc(String(form.get("isrc") ?? ""));
  const featured = splitArtists(String(form.get("featuredArtists") ?? ""));
  const rawDuration = Number(form.get("durationSec"));
  const durationSec =
    Number.isFinite(rawDuration) && rawDuration > 0 ? rawDuration : null;
  const errors: Record<string, string> = {};
  if (!title || title.length > 200)
    errors.title = "Enter a song title (up to 200 characters).";
  if (!primaryArtist || primaryArtist.length > 120)
    errors.primaryArtist = "Enter a primary artist (up to 120 characters).";
  if (!isValidIsoDate(releaseDate))
    errors.releaseDate = "Use a valid release date (YYYY-MM-DD).";
  if (!isrcCheck.valid || !isrcCheck.canonical) errors.isrc = isrcCheck.message;
  const file = form.get("audio");
  if (!(file instanceof File)) errors.audio = "Attach an MP3 or WAV master.";
  else {
    const issue = validateAudioFile(file);
    if (issue) errors.audio = issue;
  }
  let splitInput: unknown;
  try {
    splitInput = JSON.parse(String(form.get("ownership") ?? "null"));
  } catch {
    errors.ownership = "Send a valid ownership split sheet.";
  }
  const { ownership, issues } = parseDeliveryOwnership(splitInput);
  if (issues.length) errors.ownership = issues.join(" ");
  if (
    ownership &&
    !ownership.parties.some(
      (party) =>
        party.role === "Primary artist" &&
        party.name.trim().toLowerCase() === primaryArtist.toLowerCase(),
    )
  )
    errors.ownership =
      "The split sheet must include the credited primary artist.";
  if (Object.keys(errors).length)
    return NextResponse.json(
      { error: "Delivery rejected.", errors },
      { status: 422 },
    );
  const audioFile = file as File;
  const info = ACCEPTED_AUDIO[extensionOf(audioFile.name)];
  const header = new Uint8Array(await audioFile.slice(0, 12).arrayBuffer());
  if (!hasAudioSignature(header, info.format))
    return NextResponse.json(
      {
        error: "The audio content does not match the file extension.",
        errors: { audio: "Use a valid WAV or MP3 audio container." },
      },
      { status: 422 },
    );
  let storedName: string | null = null;
  try {
    storedName = await saveUpload(
      new Uint8Array(await audioFile.arrayBuffer()),
      audioFile.name,
    );
    const track = await addTrack({
      title,
      primaryArtist,
      featuredArtists: featured,
      releaseDate,
      isrc: isrcCheck.canonical!,
      fileName: audioFile.name,
      format: info.format,
      mimeType: info.mime,
      sizeBytes: audioFile.size,
      durationSec,
      storedName,
      ownership: ownership!,
    });
    return NextResponse.json({ track }, { status: 201 });
  } catch (error) {
    if (storedName) await removeUpload(storedName);
    if (error instanceof DuplicateIsrcError)
      return NextResponse.json(
        { error: error.message, errors: { isrc: error.message } },
        { status: 409 },
      );
    console.error("Master delivery failed", error);
    return NextResponse.json(
      {
        error:
          "The master could not be saved. Your staged file is still available; please retry.",
      },
      { status: 500 },
    );
  }
}

/** Unique local demo reservation, not an official IFPI registration. */
export async function PUT(request: Request) {
  if (!masterUploadsAvailable())
    return NextResponse.json({ error: MASTER_STORAGE_NOTICE }, { status: 503 });
  const releaseDate =
    new URL(request.url).searchParams.get("releaseDate") ||
    new Date().toISOString().slice(0, 10);
  if (!isValidIsoDate(releaseDate))
    return NextResponse.json(
      { error: "Invalid release date." },
      { status: 400 },
    );
  try {
    return NextResponse.json({
      isrc: await reserveIsrc(releaseDate),
      registration: "local-demo-only",
    });
  } catch (error) {
    if (error instanceof RangeError)
      return NextResponse.json({ error: error.message }, { status: 409 });
    console.error("ISRC reservation failed", error);
    return NextResponse.json(
      {
        error:
          "Could not reserve a local tag. Retry or enter your existing ISRC.",
      },
      { status: 500 },
    );
  }
}
