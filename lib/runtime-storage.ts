import "server-only";
import { postgresStorageEnabled } from "@/lib/postgres/pool";
import { masterDeliveryMode } from "@/lib/master-storage-config";

/** Vercel's local disk is not a shared datastore. Never accept a write into /tmp as durable success. */
export function referenceStorageOnly(): boolean {
  return (
    process.env.EAST_SOUND_STATIC_EXPORT === "1" ||
    (process.env.VERCEL === "1" && !postgresStorageEnabled())
  );
}
export function capturePollingAvailable(): boolean {
  return (
    process.env.EAST_SOUND_STATIC_EXPORT !== "1" && !referenceStorageOnly()
  );
}
export function masterUploadsAvailable(): boolean {
  return masterDeliveryMode() !== "disabled";
}
export function deploymentStorageNotice(): string | null {
  if (referenceStorageOnly())
    return "Read-only reference deployment: public releases only, with no connected capture storage. Only public charts and statistics are accessible; private workspaces require persistent authenticated storage. Live capture requires configured PostgreSQL; master delivery requires authenticated durable storage.";
  if (!masterUploadsAvailable())
    return "Cloud deployment: capture storage uses the configured PostgreSQL backend. Master delivery and catalogue mutations remain disabled until authenticated durable master storage is available.";
  return masterDeliveryMode() === "direct-blob"
    ? "Cloud masters use private object storage with authenticated streaming. Live captures and notifications require separately configured providers and consent."
    : null;
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
  "Master uploads, tag reservations and catalogue deletions are disabled for this deployment or development-only mock identity. Use a non-mock artist account and configure a PRIVATE Blob store with PostgreSQL for cloud delivery, or a Node host with durable storage. No file or catalogue change was saved.";
