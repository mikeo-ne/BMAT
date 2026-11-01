import "server-only";
import {
  referenceStorageOnly,
  assertMutableStorage,
} from "@/lib/runtime-storage";
import { postgresStorageEnabled } from "@/lib/postgres/pool";
import {
  readPostgresAttempts,
  claimPostgresAttempt,
  finishPostgresAttempt,
} from "@/lib/postgres/scheduled-attempts";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { TransportResult } from "@/lib/notification-transport";

export interface DeliveryAttempt {
  id: string;
  channel: "whatsapp" | "email" | "webhook";
  status: "attempting" | "accepted" | "retry" | "failed";
  attempts: number;
  createdAt: string;
  updatedAt: string;
  leaseUntil?: string;
  nextAttemptAt?: string;
  code?: string;
}
const directory = () =>
  process.env.EAST_SOUND_DATA_DIR ?? path.join(process.cwd(), ".data");
const file = () => path.join(directory(), "notification-attempts.json");
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(operation: () => Promise<T>): Promise<T> {
  const next = queue.then(operation);
  queue = next.catch(() => undefined);
  return next;
}
export async function readDeliveryAttempts(): Promise<DeliveryAttempt[]> {
  if (referenceStorageOnly()) return [];
  if (postgresStorageEnabled()) return readPostgresAttempts();
  try {
    const parsed: unknown = JSON.parse(await readFile(file(), "utf8"));
    const ids = new Set<string>();
    const timestamp = (value: unknown): value is string =>
      typeof value === "string" && Number.isFinite(Date.parse(value));
    if (
      !Array.isArray(parsed) ||
      parsed.some((row) => {
        if (
          !row ||
          typeof row !== "object" ||
          Array.isArray(row) ||
          typeof row.id !== "string" ||
          !row.id ||
          row.id.length > 1600 ||
          /[\r\n]/.test(row.id) ||
          ids.has(row.id) ||
          !["whatsapp", "email", "webhook"].includes(row.channel) ||
          !["attempting", "accepted", "retry", "failed"].includes(row.status) ||
          !Number.isInteger(row.attempts) ||
          row.attempts < 1 ||
          row.attempts > 3 ||
          !timestamp(row.createdAt) ||
          !timestamp(row.updatedAt) ||
          Date.parse(row.createdAt) > Date.parse(row.updatedAt) ||
          (row.code !== undefined &&
            (typeof row.code !== "string" ||
              !/^[a-z0-9_-]{1,64}$/.test(row.code)))
        )
          return true;
        ids.add(row.id);
        if (row.status === "attempting")
          return !timestamp(row.leaseUntil) || row.nextAttemptAt !== undefined;
        if (row.status === "retry")
          return (
            !timestamp(row.nextAttemptAt) ||
            row.leaseUntil !== undefined ||
            row.attempts >= 3
          );
        return row.leaseUntil !== undefined || row.nextAttemptAt !== undefined;
      })
    )
      throw new Error(
        "Invalid notification attempt store; restore it before dispatch.",
      );
    return parsed as DeliveryAttempt[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}
async function write(rows: DeliveryAttempt[]) {
  await mkdir(directory(), { recursive: true });
  const temp = `${file()}.${randomUUID()}.tmp`;
  try {
    await writeFile(temp, JSON.stringify(rows, null, 2), "utf8");
    await rename(temp, file());
  } finally {
    await rm(temp, { force: true });
  }
}

/** Reserve before I/O, retain accepted IDs for 30 days, lease crashes, and cap retries at three. */
export function claimDelivery(
  id: string,
  channel: DeliveryAttempt["channel"],
  now = new Date(),
): Promise<DeliveryAttempt | null> {
  assertMutableStorage();
  if (postgresStorageEnabled()) return claimPostgresAttempt(id, channel);
  return serial(async () => {
    const rows = (await readDeliveryAttempts()).filter(
      (row) => Date.parse(row.createdAt) >= now.getTime() - 30 * 86400000,
    );
    const current = rows.find((row) => row.id === id);
    if (current) {
      if (
        current.status === "accepted" ||
        current.status === "failed" ||
        (current.leaseUntil &&
          Date.parse(current.leaseUntil) > now.getTime()) ||
        (current.nextAttemptAt &&
          Date.parse(current.nextAttemptAt) > now.getTime())
      )
        return null;
      if (current.attempts >= 3) {
        Object.assign(current, {
          status: "failed",
          updatedAt: now.toISOString(),
          code: "attempt_limit",
        });
        delete current.leaseUntil;
        delete current.nextAttemptAt;
        await write(rows);
        return null;
      }
    }
    const next: DeliveryAttempt = {
      id,
      channel,
      status: "attempting",
      attempts: (current?.attempts ?? 0) + 1,
      createdAt: current?.createdAt ?? now.toISOString(),
      updatedAt: now.toISOString(),
      leaseUntil: new Date(now.getTime() + 120000).toISOString(),
    };
    await write([...rows.filter((row) => row.id !== id), next]);
    return next;
  });
}
export function finishDelivery(
  id: string,
  result: TransportResult,
  attempt: number,
  now = new Date(),
): Promise<DeliveryAttempt["status"] | undefined> {
  assertMutableStorage();
  if (postgresStorageEnabled())
    return finishPostgresAttempt(id, result, attempt);
  return serial(async () => {
    const rows = await readDeliveryAttempts();
    const row = rows.find((entry) => entry.id === id);
    if (!row || row.status !== "attempting" || row.attempts !== attempt) return;
    row.status = result.accepted
      ? "accepted"
      : result.retryable && row.attempts < 3
        ? "retry"
        : "failed";
    row.code = /^[a-z0-9_-]{1,64}$/.test(result.code)
      ? result.code
      : "provider_result";
    row.updatedAt = now.toISOString();
    delete row.leaseUntil;
    if (row.status === "retry")
      row.nextAttemptAt = new Date(
        now.getTime() + 60000 * 2 ** (row.attempts - 1),
      ).toISOString();
    else delete row.nextAttemptAt;
    await write(rows);
    return row.status;
  });
}
