// D2B §10.1/§14 log allowlist: no child payload, names, phones, free text, tokens or cookies.
import { describe, expect, it } from "vitest";
import { createLogger, levelFor, type LogEntry } from "@/app/api/_shared/log";

const NAME = "রাফি হাসান";
const PHONE = "01712345678";
const PHONE_BN = "০১৭১২৩৪৫৬৭৮";
const TOKEN = "eyJhbGciOiJIUzI1NiJ9.synthetic.token";
const NOTE = "বাজারের কাছে নীল জামা পরা অবস্থায় দেখা গেছে";

function capture() {
  const lines: string[] = [];
  return { lines, log: createLogger((l) => lines.push(l), () => 1_700_000_000_000) };
}

describe("allowlist logger", () => {
  it("writes only allowlisted keys with valid values", () => {
    const { lines, log } = capture();
    const hostile = {
      event: "request",
      request_id: "0b9f6a1e-3c4d-4e5f-8a7b-9c0d1e2f3a4b",
      route: "API-003",
      method: "POST",
      role: "parent",
      status: 400,
      duration_ms: 12.6,
      error_id: "E-001",
      child_name: NAME,
      contact_phone: PHONE,
      draft_token: TOKEN,
      cookie: `fera_ps=${TOKEN}`,
      body: { child: { name: NAME, phone: PHONE_BN }, circumstances: NOTE },
      msg: `failed for ${NAME}`,
      stack: `Error: ${PHONE}\n    at handler`,
    } as unknown as LogEntry;
    log.warn(hostile);
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toEqual({
      level: 40,
      time: 1_700_000_000_000,
      event: "request",
      request_id: "0b9f6a1e-3c4d-4e5f-8a7b-9c0d1e2f3a4b",
      route: "API-003",
      method: "POST",
      role: "parent",
      status: 400,
      duration_ms: 13,
      error_id: "E-001",
    });
    for (const leak of [NAME, PHONE, PHONE_BN, TOKEN, NOTE, "fera_ps", "at handler"]) expect(lines[0]).not.toContain(leak);
  });

  it("drops sensitive values smuggled into allowlisted keys", () => {
    const { lines, log } = capture();
    log.error({
      event: "handler.threw",
      request_id: PHONE,
      route: NAME,
      role: TOKEN,
      rule: NOTE,
      err_name: `Error: ${PHONE}`,
      method: "post; drop table",
      status: 99,
      error_id: "E-999",
    } as unknown as LogEntry);
    expect(JSON.parse(lines[0])).toEqual({ level: 50, time: 1_700_000_000_000, event: "handler.threw" });
  });

  it("drops an unknown event name and never throws on a broken sink", () => {
    const { lines, log } = capture();
    log.info({ event: NAME } as unknown as LogEntry);
    expect(JSON.parse(lines[0])).toEqual({ level: 30, time: 1_700_000_000_000 });
    const broken = createLogger(() => {
      throw new Error("sink down");
    });
    expect(() => broken.info({ event: "request" })).not.toThrow();
  });

  it("maps statuses to D2B §13 developer-log levels", () => {
    expect(levelFor(200)).toBe("info");
    expect(levelFor(401, "E-002")).toBe("info");
    expect(levelFor(400, "E-001")).toBe("warn");
    expect(levelFor(403, "E-003")).toBe("warn");
    expect(levelFor(429, "E-007")).toBe("warn");
    expect(levelFor(500, "E-021")).toBe("error");
    expect(levelFor(503, "E-011")).toBe("error");
  });
});
