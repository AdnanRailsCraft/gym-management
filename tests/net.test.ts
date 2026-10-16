import net from "node:net";
import { describe, expect, it } from "vitest";
import { findFreeLoopbackPort } from "../electron/port";
import { generateLaunchToken } from "../electron/token";

describe("findFreeLoopbackPort", () => {
  it("returns a port that is bindable on 127.0.0.1", async () => {
    const port = await findFreeLoopbackPort();
    expect(port).toBeGreaterThan(0);
    await new Promise<void>((resolve, reject) => {
      const srv = net.createServer();
      srv.once("error", reject);
      srv.listen(port, "127.0.0.1", () => {
        const addr = srv.address();
        if (typeof addr === "object" && addr) {
          expect(addr.port).toBe(port);
          srv.close(() => resolve());
        } else {
          srv.close(() => reject(new Error("bad address")));
        }
      });
    });
  });

  it("returns distinct ports on consecutive calls", async () => {
    const a = await findFreeLoopbackPort();
    const b = await findFreeLoopbackPort();
    expect(a).not.toBe(b);
  });
});

describe("generateLaunchToken", () => {
  it("is 64 hex characters", () => {
    const t = generateLaunchToken();
    expect(t).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is unique per call", () => {
    const tokens = new Set(Array.from({ length: 20 }, () => generateLaunchToken()));
    expect(tokens.size).toBe(20);
  });
});
