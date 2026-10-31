import { randomBytes } from "node:crypto";

/** Per-launch secret; never reused across runs, never written to disk. */
export function generateLaunchToken(): string {
  return randomBytes(32).toString("hex");
}
