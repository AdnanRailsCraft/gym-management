import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  LAUNCH_TOKEN_COOKIE,
  checkGate,
  parseCookieToken,
} from "@/server/security/token";

const TOKEN = "t".repeat(64);
const ENV_KEYS = ["GMS_LAUNCH_TOKEN", "NODE_ENV"] as const;
const SAVED: Record<string, string | undefined> = {};

// Next's types mark NODE_ENV readonly; the index signature stays writable.
function setEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

function baseInput(overrides: Partial<Parameters<typeof checkGate>[0]> = {}) {
  return {
    method: "GET",
    authorization: null,
    cookie: null,
    origin: null,
    host: "127.0.0.1:12345",
    ...overrides,
  };
}

beforeEach(() => {
  for (const k of ENV_KEYS) SAVED[k] = process.env[k];
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    setEnv(k, SAVED[k]);
  }
});

describe("checkGate", () => {
  it("allows all requests in dev when no token is configured", () => {
    setEnv("GMS_LAUNCH_TOKEN", undefined);
    setEnv("NODE_ENV", "development");
    expect(checkGate(baseInput()).ok).toBe(true);
  });

  it("fails closed in production when no token is configured", () => {
    setEnv("GMS_LAUNCH_TOKEN", undefined);
    setEnv("NODE_ENV", "production");
    const r = checkGate(baseInput());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(503);
  });

  it("accepts a valid Bearer token in production", () => {
    setEnv("GMS_LAUNCH_TOKEN", TOKEN);
    setEnv("NODE_ENV", "production");
    expect(
      checkGate(baseInput({ authorization: `Bearer ${TOKEN}` })).ok,
    ).toBe(true);
  });

  it("accepts a valid cookie token in production", () => {
    setEnv("GMS_LAUNCH_TOKEN", TOKEN);
    setEnv("NODE_ENV", "production");
    expect(
      checkGate(baseInput({ cookie: `other=1; ${LAUNCH_TOKEN_COOKIE}=${TOKEN}` }))
        .ok,
    ).toBe(true);
  });

  it("rejects a wrong Bearer token with 401", () => {
    setEnv("GMS_LAUNCH_TOKEN", TOKEN);
    setEnv("NODE_ENV", "production");
    const r = checkGate(baseInput({ authorization: "Bearer x".padEnd(70, "x") }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(401);
  });

  it("rejects a missing token with 401 in production", () => {
    setEnv("GMS_LAUNCH_TOKEN", TOKEN);
    setEnv("NODE_ENV", "production");
    const r = checkGate(baseInput());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(401);
  });

  it("rejects cross-origin mutating requests with 403 even when token is valid", () => {
    setEnv("GMS_LAUNCH_TOKEN", TOKEN);
    setEnv("NODE_ENV", "production");
    const r = checkGate(
      baseInput({
        method: "POST",
        authorization: `Bearer ${TOKEN}`,
        origin: "http://evil.example",
      }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(403);
  });

  it("allows same-origin mutating requests with a valid token", () => {
    setEnv("GMS_LAUNCH_TOKEN", TOKEN);
    setEnv("NODE_ENV", "production");
    expect(
      checkGate(
        baseInput({
          method: "POST",
          authorization: `Bearer ${TOKEN}`,
          origin: "http://127.0.0.1:12345",
        }),
      ).ok,
    ).toBe(true);
  });

  it("rejects an invalid Origin header on mutating requests", () => {
    setEnv("GMS_LAUNCH_TOKEN", TOKEN);
    setEnv("NODE_ENV", "production");
    const r = checkGate(
      baseInput({
        method: "DELETE",
        authorization: `Bearer ${TOKEN}`,
        origin: "not a url",
      }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(403);
  });

  it("rejects a short env token (under 32 chars) as unconfigured", () => {
    process.env.GMS_LAUNCH_TOKEN = "short";
    setEnv("NODE_ENV", "production");
    const r = checkGate(baseInput({ authorization: "Bearer short" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(503);
  });
});

describe("parseCookieToken", () => {
  it("returns null for missing header", () => {
    expect(parseCookieToken(null)).toBeNull();
  });
  it("returns null for empty value", () => {
    expect(parseCookieToken(`${LAUNCH_TOKEN_COOKIE}=`)).toBeNull();
  });
  it("extracts the cookie among others", () => {
    expect(parseCookieToken(`a=1; ${LAUNCH_TOKEN_COOKIE}=abc; b=2`)).toBe("abc");
  });
});
