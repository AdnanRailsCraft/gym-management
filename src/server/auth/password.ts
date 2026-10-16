import "server-only";
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

// OWASP-recommended scrypt floor for interactive logins (N=2^15, r=8, p=1).
const N = 32768;
const R = 8;
const P = 1;
const KEYLEN = 64;
// scrypt needs ~128 * N * r * p bytes; default maxmem (32MB) is too tight.
const MAXMEM = 96 * 1024 * 1024;
const SALT_BYTES = 16;

export const MIN_PASSWORD_LENGTH = 10;

let dummyHashPromise: Promise<string> | null = null;

function dummyHash(): Promise<string> {
  if (!dummyHashPromise) {
    dummyHashPromise = hashPassword(randomBytes(32).toString("hex"));
  }
  return dummyHashPromise;
}

export async function hashPassword(plain: string): Promise<string> {
  if (plain.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  const salt = randomBytes(SALT_BYTES);
  const hash = await scrypt(plain, salt, KEYLEN, { N, r: R, p: P, maxmem: MAXMEM });
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

/**
 * Constant-time verify. Returns false on any malformed stored hash instead
 * of throwing, so a corrupt row cannot take the login path down.
 */
export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) return false;
  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(parts[4]!, "base64");
    expected = Buffer.from(parts[5]!, "base64");
  } catch {
    return false;
  }
  if (salt.length === 0 || expected.length === 0) return false;
  let actual: Buffer;
  try {
    actual = await scrypt(plain, salt, expected.length, { N: n, r, p, maxmem: MAXMEM });
  } catch {
    return false;
  }
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

/**
 * Verify against a throwaway hash when the username does not exist, so
 * unknown-user and wrong-password responses take similar time.
 */
export async function verifyPasswordDummy(plain: string): Promise<false> {
  await verifyPassword(plain, await dummyHash());
  return false;
}
