import "dotenv/config";
import { migratePostgres } from "@/lib/postgres/migrate";
import { seedPostgres } from "@/lib/postgres/catalogue";
import {
  closePostgresPool,
  postgresPool,
  postgresStorageEnabled,
  postgresTenant,
} from "@/lib/postgres/pool";

async function main() {
  if (!postgresStorageEnabled())
    throw new Error(
      "Select EAST_SOUND_STORAGE_BACKEND=postgres explicitly before database operations.",
    );
  const action = process.argv[2],
    pool = postgresPool();
  if (action === "migrate")
    console.log(
      JSON.stringify({ migrationsApplied: await migratePostgres(pool) }),
    );
  else if (action === "seed")
    console.log(JSON.stringify(await seedPostgres(pool, postgresTenant())));
  else
    throw new Error(
      "Use db:migrate or db:seed. No destructive reset command is provided.",
    );
}
main()
  .catch(() => {
    console.error(
      "Database command failed. Verify configuration, migration checksums and database permissions. No credentials or driver messages are logged.",
    );
    process.exitCode = 1;
  })
  .finally(closePostgresPool);
