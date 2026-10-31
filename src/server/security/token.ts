import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

export const LAUNCH_TOKEN_COOKIE = "gms_lt";

export type GateResult =
  | { ok: true }
  | { ok: false; status: 401 | 403 | 503; message: string };

function expectedToken(): string | null {
  const t = process.env.GMS_LAUNCH_TOKEN;
  return t && t.length >= 32 ? t : null;
}

function isProd(): boolean {
  return process.env.NODE_ENV === "production";
}

function tokensEqual(a: string, b: string): boolean {
  // Hash first so timingSafeEqual gets equal-length buffers and the
  // comparison does not leak token length.
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function parseCookieToken(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === LAUNCH_TOKEN_COOKIE) {
      return part.slice(eq + 1).trim() || null;
    }
  }
  return null;
}

export interface GateInput {
  method: string;
  authorization: string | null;
  cookie: string | null;
  origin: string | null;
  host: string | null;
}

/**
 * Launch-token gate for every request.
 *
 * - Production without a configured token fails closed (503).
 * - Development/test without a configured token allows all requests so
 *   `npm run dev` works in a plain browser.
 * - Mutating requests with a cross-origin Origin header are rejected (403)
 *   even with a valid token.
 */
export function checkGate(input: GateInput): GateResult {
  const expected = expectedToken();
  if (!expected) {
    return isProd()
      ? { ok: false, status: 503, message: "Launch token not configured" }
      : { ok: true };
  }

  let provided: string | null = null;
  if (input.authorization?.startsWith("Bearer ")) {
    provided = input.authorization.slice(7).trim() || null;
  }
  if (!provided) {
    provided = parseCookieToken(input.cookie);
  }
  if (!provided || !tokensEqual(provided, expected)) {
    return { ok: false, status: 401, message: "Missing or invalid launch token" };
  }

  const method = input.method.toUpperCase();
  const mutating = method !== "GET" && method !== "HEAD" && method !== "OPTIONS";
  if (mutating && input.origin) {
    try {
      const originHost = new URL(input.origin).host;
      if (input.host && originHost !== input.host) {
        return { ok: false, status: 403, message: "Cross-origin request rejected" };
      }
    } catch {
      return { ok: false, status: 403, message: "Invalid Origin header" };
    }
  }
  return { ok: true };
}

export function gateFromRequest(req: Request): GateResult {
  return checkGate({
    method: req.method,
    authorization: req.headers.get("authorization"),
    cookie: req.headers.get("cookie"),
    origin: req.headers.get("origin"),
    host: req.headers.get("host"),
  });
}
