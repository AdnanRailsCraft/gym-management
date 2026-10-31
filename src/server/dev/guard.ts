import "server-only";

/**
 * Developer tools are a build-time convenience, not a production feature.
 *
 * `src/server/dev/actions.ts` exposes powerful unauthenticated server actions
 * (create owner, quick-login, reset password, wipe users). They are part of the
 * public HTTP surface, so they must be disabled by default in a packaged build
 * and only re-enabled explicitly with `GMS_ENABLE_DEV_MENU=1` (for a developer
 * machine). Development and test keep them available.
 */
export function devToolsEnabled(): boolean {
  if (process.env.GMS_ENABLE_DEV_MENU === "1") return true;
  return process.env.NODE_ENV !== "production";
}

export const DEV_TOOLS_DISABLED = "Developer tools are disabled in this build";
