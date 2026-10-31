import { backupsDir, dbFile, migrationsDir } from "../src/server/config/env";
import { runMigrations } from "../src/server/db/migrate";

// Async main (not top-level await): this package is CJS, and tsx treats
// top-level await as a hard error there.
async function main(): Promise<void> {
  const result = await runMigrations({
    dbFile: dbFile(),
    migrationsDir: migrationsDir(),
    backupsDir: backupsDir(),
  });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
