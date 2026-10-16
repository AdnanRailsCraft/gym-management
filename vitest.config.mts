import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // "server-only" throws outside the Next.js server bundler; tests run
      // the same server modules directly, so stub it like Next's react-server
      // build (empty module).
      "server-only": path.resolve(import.meta.dirname, "tests/helpers/server-only-stub.ts"),
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    env: {
      NODE_ENV: "test",
      NEXT_TELEMETRY_DISABLED: "1",
    },
    // Serial by default: tests manipulate shared process.env (token mode).
    fileParallelism: false,
  },
});
