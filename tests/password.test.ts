import { afterEach, describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/server/auth/password";

afterEach(() => {
  // nothing — pure functions
});

describe("password hashing", () => {
  it("round-trips a valid password", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("correct horse battery", hash)).toBe(true);
  });

  it("rejects a wrong password", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(await verifyPassword("wrong password!", hash)).toBe(false);
  });

  it("rejects short passwords at hash time", async () => {
    await expect(hashPassword("short")).rejects.toThrow(/at least 10/);
  });

  it("returns false for malformed stored hashes instead of throwing", async () => {
    expect(await verifyPassword("anything at all", "not-a-hash")).toBe(false);
    expect(await verifyPassword("anything at all", "scrypt$1$2$3$$")).toBe(false);
    expect(await verifyPassword("anything at all", "bcrypt$32768$8$1$aa$bb")).toBe(false);
  });
});
