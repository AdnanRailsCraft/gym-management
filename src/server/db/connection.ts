import "server-only";
import type { Db } from "./index";
import { openDb } from "./index";
import { dbFile } from "@/server/config/env";

let cached: Db | null = null;

/**
 * Process-wide database handle for the Next.js server runtime. One SQLite
 * file per app instance; WAL + FK + busy timeout set by openDb.
 */
export function getDb(): Db {
  if (!cached || !cached.open) {
    cached = openDb(dbFile());
  }
  return cached;
}
