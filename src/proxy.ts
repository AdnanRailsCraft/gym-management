import { NextResponse, type NextRequest } from "next/server";
import { gateFromRequest } from "@/server/security/token";
import { SESSION_COOKIE, validateSession } from "@/server/auth/sessions";
import { getDb } from "@/server/db/connection";

/**
 * Request pipeline (Next 16 proxy, Node runtime):
 *  1. Launch-token gate (Phase 0) — every path, fail-closed in production.
 *  2. Cross-origin mutating requests already rejected by the gate.
 *  3. Session gate — /login and /setup (pre-owner only) are session-free;
 *     everything else needs a valid session cookie. API paths get 401 JSON,
 *     browser paths redirect to /login.
 */

const SESSION_FREE = new Set(["/api/health"]);

export default async function proxy(req: NextRequest) {
  const gate = gateFromRequest(req);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.message }, { status: gate.status });
  }

  const { pathname } = req.nextUrl;
  // Static assets only need the launch-token gate (already ran above).
  // Client JS/CSS and public branding assets for /login and /setup must load without a session.
  if (
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/branding/") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  // Launch-token-only paths (no user session required; never redirect).
  if (
    SESSION_FREE.has(pathname) ||
    pathname === "/dev" ||
    pathname.startsWith("/api/dev") ||
    pathname === "/setup"
  ) {
    return NextResponse.next();
  }

  const isApi = pathname.startsWith("/api/");
  const db = getDb();
  const token = req.cookies.get(SESSION_COOKIE)?.value ?? null;
  const sessionOk = validateSession(db, token) !== null;

  if (pathname === "/login") {
    if (sessionOk) {
      return NextResponse.redirect(new URL("/", req.url));
    }
    return NextResponse.next();
  }

  if (!sessionOk) {
    if (isApi) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/:path*"],
};
