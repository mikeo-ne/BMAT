import "dotenv/config";
import { setTimeout as delay } from "node:timers/promises";
import { processPostgresOutbox } from "@/lib/postgres/outbox";
import { notificationProviderReadiness } from "@/lib/notification-transport";
import { closePostgresPool, postgresStorageEnabled } from "@/lib/postgres/pool";

const shutdown = new AbortController();
process.once("SIGTERM", () => shutdown.abort());
process.once("SIGINT", () => shutdown.abort());
async function main() {
  if (!postgresStorageEnabled()) throw new Error("PostgreSQL is not enabled.");
  const ready = notificationProviderReadiness();
  if (
    !ready.liveEnabled ||
    ![ready.whatsapp, ready.email, ready.webhook].some(Boolean)
  )
    throw new Error("Live provider delivery is not configured.");
  const once = process.argv.includes("--once");
  console.log(
    "East Sound PostgreSQL notification worker started (provider acceptance is not a delivery receipt).",
  );
  while (!shutdown.signal.aborted) {
    try {
      const result = await processPostgresOutbox();
      if (result.attempted) console.log(JSON.stringify(result));
      if (once) return;
      // Always yield; an unavailable database must not cause a tight polling loop.
      await delay(result.attempted ? 100 : 3000, undefined, {
        signal: shutdown.signal,
      });
    } catch {
      if (shutdown.signal.aborted) return;
      console.error(
        "Notification batch unavailable; leases/retries preserve pending work. No destinations or provider error bodies are logged.",
      );
      if (once) {
        process.exitCode = 1;
        return;
      }
      await delay(3000, undefined, { signal: shutdown.signal }).catch(() => {});
    }
  }
}
main()
  .catch(() => {
    console.error(
      "Worker disabled: configure PostgreSQL, explicit live enable and at least one real provider. No jobs were claimed.",
    );
    process.exitCode = 1;
  })
  .finally(closePostgresPool);
