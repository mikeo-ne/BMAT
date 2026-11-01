import "server-only";
import {
  referenceStorageOnly,
  assertMutableStorage,
} from "@/lib/runtime-storage";
import { postgresStorageEnabled } from "@/lib/postgres/pool";
import {
  readPostgresSpins,
  appendPostgresSpins,
} from "@/lib/postgres/captures";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { isStoredCapturedSpin } from "@/lib/captured-airplay";
import type { BroadcastSpin } from "@/lib/playout";

const directory = () =>
  process.env.EAST_SOUND_DATA_DIR ?? path.join(process.cwd(), ".data");
const filename = () => path.join(directory(), "broadcasts.json");
let mutations: Promise<unknown> = Promise.resolve();

/** No capture records are fabricated when the file is absent. Corrupt records are never replaced. */
export async function readCapturedSpins(): Promise<BroadcastSpin[]> {
  if (referenceStorageOnly()) return [];
  if (postgresStorageEnabled()) return readPostgresSpins();
  try {
    const parsed: unknown = JSON.parse(await readFile(filename(), "utf8"));
    if (
      !Array.isArray(parsed) ||
      parsed.some((row) => !isStoredCapturedSpin(row)) ||
      new Set(parsed.map((row) => row.id)).size !== parsed.length
    )
      throw new Error(
        "Invalid captured-broadcast store; restore it before ingestion.",
      );
    return parsed as BroadcastSpin[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

/** Idempotent single-process append; the same provider event ID cannot create duplicate spins. */
export function appendCapturedSpins(
  incoming: BroadcastSpin[],
): Promise<{ inserted: number; duplicates: number }> {
  assertMutableStorage();
  if (postgresStorageEnabled()) return appendPostgresSpins(incoming);
  const operation = mutations.then(async () => {
    if (incoming.some((spin) => !isStoredCapturedSpin(spin)))
      throw new Error("Only validated captured events may be persisted.");
    await mkdir(directory(), { recursive: true, mode: 0o700 });
    const current = await readCapturedSpins();
    const byId = new Map(current.map((row) => [row.id, row]));
    let inserted = 0;
    for (const spin of incoming)
      if (!byId.has(spin.id)) {
        byId.set(spin.id, spin);
        inserted++;
      }
    const next = [...byId.values()].sort((a, b) =>
      b.detectedAt.localeCompare(a.detectedAt),
    );
    const temporary = `${filename()}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, JSON.stringify(next, null, 2), {
        encoding: "utf8",
        mode: 0o600,
        flag: "wx",
      });
      await rename(temporary, filename());
    } finally {
      await rm(temporary, { force: true });
    }
    return { inserted, duplicates: incoming.length - inserted };
  });
  mutations = operation.catch(() => undefined);
  return operation.then(async (result) => {
    const { reconcileFileOutbox } = await import(
      "@/lib/file-notification-queue"
    );
    await reconcileFileOutbox();
    return result;
  });
}
