import path from "node:path";

export function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === "production";
}

export function dataDir(): string {
  const fromEnv = process.env.GMS_DATA_DIR;
  if (fromEnv && fromEnv.trim()) return fromEnv;
  if (isProductionRuntime()) {
    throw new Error("GMS_DATA_DIR must be set by the Electron host in production");
  }
  return path.join(process.cwd(), ".data");
}

export function dbFile(): string {
  return path.join(dataDir(), "db", "gym.db");
}

export function backupsDir(): string {
  return path.join(dataDir(), "backups");
}

export function migrationsDir(): string {
  // Packaged server cwd is resources/app, which ships db/migrations.
  return path.join(process.cwd(), "db", "migrations");
}

export function appVersion(): string {
  return process.env.GMS_APP_VERSION ?? "dev";
}
