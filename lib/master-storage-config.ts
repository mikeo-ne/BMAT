import "server-only";
import { postgresStorageEnabled } from "@/lib/postgres/pool";

export type MasterDeliveryMode = "local" | "direct-blob" | "disabled";
/** Configuration is not a provider connectivity check. Private access is probed before issuing an upload ticket. */
export function masterDeliveryMode(): MasterDeliveryMode {
  if (process.env.EAST_SOUND_STATIC_EXPORT === "1") return "disabled";
  if (process.env.EAST_SOUND_MASTER_STORAGE === "vercel-blob") {
    return postgresStorageEnabled() &&
      (process.env.BLOB_READ_WRITE_TOKEN?.length ?? 0) >= 32
      ? "direct-blob"
      : "disabled";
  }
  if (
    process.env.EAST_SOUND_MASTER_STORAGE &&
    process.env.EAST_SOUND_MASTER_STORAGE !== "local"
  )
    return "disabled";
  return process.env.VERCEL === "1" ? "disabled" : "local";
}
export function privateBlobToken(): string {
  if (masterDeliveryMode() !== "direct-blob")
    throw new Error("Private master storage is not configured.");
  return process.env.BLOB_READ_WRITE_TOKEN!;
}
