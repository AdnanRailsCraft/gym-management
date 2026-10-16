import { NextResponse, type NextRequest } from "next/server";
import { gateFromRequest } from "@/server/security/token";
import { SESSION_COOKIE, validateSession } from "@/server/auth/sessions";
import { getDb } from "@/server/db/connection";
import { ownerExists } from "@/server/users/service";

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
  const isApi = pathname.startsWith("/api/") || pathname.startsWith("/_next/");
  const token = req.cookies.get(SESSION_COOKIE)?.value ?? null;
  const db = getDb();
  const sessionOk = validateSession(db, token) !== null;

  if (pathname === "/setup" && !ownerExists(db)) {
    return NextResponse.next();
  }

  if (pathname === "/login") {
    if (sessionOk) {
      return NextResponse.redirect(new URL("/", req.url));
    }
    return NextResponse.next();
  }

  // Launch-token-only paths (no session required; never redirect).
  if (SESSION_FREE.has(pathname)) {
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
