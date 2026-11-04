import "dotenv/config";
import { readFileSync } from "node:fs";
import { createAccount } from "@/lib/auth-core";
import { FM_STATIONS } from "@/lib/regions";
import { closePostgresPool } from "@/lib/postgres/pool";
import type { AccountRole } from "@/lib/auth-types";
function option(name: string) {
  const i = process.argv.indexOf("--" + name);
  return i < 0 ? "" : (process.argv[i + 1] ?? "");
}
async function main() {
  const role = option("role") as AccountRole;
  if (!["artist", "broadcaster", "cmo"].includes(role))
    throw new Error("Choose --role artist, broadcaster or cmo.");
  const stationIds = option("stations")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (
    stationIds.some(
      (id) => ![...FM_STATIONS.map((s) => s.id), "nbs-tv-kla"].includes(id),
    ) ||
    new Set(stationIds).size !== stationIds.length
  )
    throw new Error("Use unique station IDs from lib/regions.ts.");
  if (role !== "broadcaster" && stationIds.length)
    throw new Error("Station assignments apply only to broadcaster accounts.");
  if (role === "broadcaster" && !stationIds.length)
    throw new Error("Assign at least one station with --stations.");
  // Passwords are read from a pipe/environment, never positional arguments or logs.
  const password =
    process.env.EAST_SOUND_ACCOUNT_PASSWORD ??
    (!process.stdin.isTTY ? readFileSync(0, "utf8").replace(/\r?\n$/, "") : "");
  if (!password)
    throw new Error(
      "Pipe a 12–128 character password into stdin, or set EAST_SOUND_ACCOUNT_PASSWORD in your local process environment.",
    );
  const user = await createAccount(
    {
      email: option("email"),
      name: option("name"),
      password,
      role,
      stationIds,
    },
    true,
  );
  console.log(
    JSON.stringify({
      created: true,
      id: user.id,
      role: user.role,
      stationIds: user.stationIds,
    }),
  );
}
main()
  .catch((error) => {
    console.error(
      error instanceof Error ? error.message : "Account provisioning failed.",
    );
    process.exitCode = 1;
  })
  .finally(closePostgresPool);
