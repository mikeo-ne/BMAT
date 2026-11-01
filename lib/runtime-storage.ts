import "server-only";
import { postgresStorageEnabled } from "@/lib/postgres/pool";

/** Vercel's local disk is not a shared datastore. Never accept a write into /tmp as durable success. */
export function referenceStorageOnly(): boolean {
  return (
    (process.env.EAST_SOUND_STATIC_EXPORT === "1" ||
      process.env.VERCEL === "1") &&
    !postgresStorageEnabled()
  );
}
export function capturePollingAvailable(): boolean {
  return (
    process.env.EAST_SOUND_STATIC_EXPORT !== "1" && !referenceStorageOnly()
  );
}
export function masterUploadsAvailable(): boolean {
  // An authenticated direct-to-object-storage adapter is required for Vercel,
  // including its function payload limit. Merely setting DATA_DIR cannot supply one.
  return (
    process.env.EAST_SOUND_STATIC_EXPORT !== "1" && process.env.VERCEL !== "1"
  );
}
export function deploymentStorageNotice(): string | null {
  if (referenceStorageOnly())
    return "Read-only reference deployment: public releases only, with no connected capture storage. Channel settings, previews and PDF exports stay in your browser. Live capture requires configured PostgreSQL; master delivery requires authenticated durable storage.";
  if (!masterUploadsAvailable())
    return "Cloud deployment: capture storage uses the configured PostgreSQL backend. Master delivery and catalogue mutations remain disabled until authenticated durable master storage is available.";
  return null;
}
export class StorageUnavailableError extends Error {
  constructor() {
    super(
      "Persistent writes are disabled on this reference deployment. Configure durable PostgreSQL storage; no temporary-file success or data reset is allowed.",
    );
  }
}
export function assertMutableStorage(): void {
  if (referenceStorageOnly()) throw new StorageUnavailableError();
}
export const MASTER_STORAGE_NOTICE =
  "Master uploads, tag reservations and catalogue deletions are disabled on this deployment. Use an authenticated Node host with durable storage, or implement authenticated direct-to-object-storage delivery. No file or catalogue change was saved.";
