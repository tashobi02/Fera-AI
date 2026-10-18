// TASK-006: argon2id password KDF (D2B §10.1/§10.2 A07). Synthetic passwords only.
import { describe, expect, it } from "vitest";
import { ARGON2_PARAMS, PASSWORD_MIN_CHARS, hashPassword, isCurrentHash, verifyPassword, warmPasswordCheck } from "@/server/auth";

const PASSWORD = "synthetic-pass-0001";

async function meanMs(fn: () => Promise<unknown>, runs: number): Promise<number> {
  const started = performance.now();
  for (let i = 0; i < runs; i++) await fn();
  return (performance.now() - started) / runs;
}

describe("argon2id password hashing", () => {
  it("hashes as argon2id with the OWASP profile and a fresh salt each time", async () => {
    const a = await hashPassword(PASSWORD);
    const b = await hashPassword(PASSWORD);
    expect(a).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(ARGON2_PARAMS).toMatchObject({ memoryCost: 19456, timeCost: 2, parallelism: 1 });
    expect(a).not.toBe(b);
    expect(isCurrentHash(a)).toBe(true);
  });

  it("verifies the right password and refuses a wrong one", async () => {
    const stored = await hashPassword(PASSWORD);
    expect(await verifyPassword(stored, PASSWORD)).toBe(true);
    expect(await verifyPassword(stored, `${PASSWORD}x`)).toBe(false);
    expect(await verifyPassword(stored, "")).toBe(false);
  });

  it("refuses missing, malformed, other-algorithm and other-parameter hashes without throwing", async () => {
    const weaker = (await hashPassword(PASSWORD)).replace("m=19456", "m=4096");
    for (const stored of [null, undefined, "", "synthetic-not-a-hash", "$argon2i$v=19$m=19456,t=2,p=1$abc$def", weaker]) {
      expect(await verifyPassword(stored, PASSWORD)).toBe(false);
    }
  });

  it("refuses passwords under 10 or over 200 characters at hashing time (D2B §10.2 A07)", async () => {
    expect(PASSWORD_MIN_CHARS).toBe(10);
    expect(() => hashPassword("")).toThrow();
    expect(() => hashPassword("123456789")).toThrow();
    expect(isCurrentHash(await hashPassword("1234567890"))).toBe(true);
    expect(() => hashPassword("x".repeat(201))).toThrow();
  });

  it("NFC-normalises passwords, so composed and decomposed Bangla input verify the same", async () => {
    const composed = "synthetic-\u0995\u09CB\u09A1-pass"; // কোড with ো as U+09CB
    const decomposed = "synthetic-\u0995\u09C7\u09BE\u09A1-pass"; // ো typed as ে + া
    expect(decomposed).not.toBe(composed);
    expect(decomposed.normalize("NFC")).toBe(composed);
    const stored = await hashPassword(decomposed);
    expect(await verifyPassword(stored, composed)).toBe(true);
    expect(await verifyPassword(stored, decomposed)).toBe(true);
  });

  it("warmPasswordCheck builds the dummy hash without throwing", async () => {
    await expect(warmPasswordCheck()).resolves.toBeUndefined();
  });

  it("costs about the same for an unknown account as for a wrong password (one argon2 verify each)", async () => {
    const stored = await hashPassword(PASSWORD);
    await verifyPassword(null, "warm-up"); // builds the dummy hash once
    const wrong = await meanMs(() => verifyPassword(stored, "wrong-password-x"), 6);
    const unknown = await meanMs(() => verifyPassword(null, "wrong-password-x"), 6);
    const ratio = unknown / wrong;
    expect(ratio).toBeGreaterThan(0.5);
    expect(ratio).toBeLessThan(2);
  });
});
