// D2B §10.1/§14 log allowlist: no child payload, names, phones, free text, tokens or cookies.
import { describe, expect, it } from "vitest";
import { createLogger, describeError, issueTokens, levelFor, type LogEntry } from "@/app/api/_shared/log";

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
      dropped: ["_unknown"],
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
    expect(JSON.parse(lines[0])).toEqual({
      level: 50,
      time: 1_700_000_000_000,
      event: "handler.threw",
      dropped: ["request_id", "route", "role", "rule", "err_name", "method", "status", "error_id"],
    });
    for (const leak of [NAME, PHONE, TOKEN, NOTE]) expect(lines[0]).not.toContain(leak);
  });

  it("drops an unknown event name and reports a broken sink once per minute on stderr", () => {
    const { lines, log } = capture();
    log.info({ event: NAME } as unknown as LogEntry);
    expect(JSON.parse(lines[0])).toEqual({ level: 30, time: 1_700_000_000_000, dropped: ["event"] });
    let t = 0;
    const fallback: string[] = [];
    const broken = createLogger(
      () => {
        throw new Error(`sink down ${PHONE}`);
      },
      () => t,
      (l) => fallback.push(l),
    );
    expect(() => broken.info({ event: "request" })).not.toThrow();
    broken.info({ event: "request" });
    t += 60_000;
    broken.info({ event: "request" });
    expect(fallback).toEqual(['{"level":50,"event":"log.sink_failed"}\n', '{"level":50,"event":"log.sink_failed"}\n']);
  });

  it("keeps only safe issue tokens", () => {
    const { lines, log } = capture();
    log.error({ event: "response.invalid", issues: [{ code: "unrecognized_keys", path: "" }, { code: "invalid_type", path: `child.${NAME}` }] });
    expect(JSON.parse(lines[0]).issues).toEqual([{ code: "unrecognized_keys", path: "" }]);
    expect(issueTokens(Array.from({ length: 9 }, () => ({ code: "custom", path: ["a", 0] })))).toHaveLength(5);
    expect(issueTokens([{ code: "custom", path: ["child", "age_years"] }])).toEqual([{ code: "custom", path: "child.age_years" }]);
  });

  it("maps error IDs to D2B §13 developer-log levels", () => {
    expect(levelFor(200)).toBe("info");
    expect(levelFor(500)).toBe("error");
    const table = {
      "E-001": "warn", "E-002": "info", "E-003": "warn", "E-004": "warn", "E-007": "warn", "E-008": "info",
      "E-011": "error", "E-012": "error", "E-013": "error", "E-014": "warn", "E-016": "error", "E-019": "info",
      "E-021": "error", "E-023": "warn",
    } as const;
    for (const [id, level] of Object.entries(table)) expect([id, levelFor(400, id as keyof typeof table)]).toEqual([id, level]);
  });
});

describe("phone-shaped values", () => {
  it("are dropped from every pattern-checked key, in ASCII or Bangla digits", () => {
    const { lines, log } = capture();
    log.error({
      event: "handler.threw",
      err_code: "01712345678",
      err_name: "০১৭১২৩৪৫৬৭৮",
      issues: [{ code: "invalid_type", path: "items.01712345678" }],
    } as unknown as LogEntry);
    const line = lines.join("\n");
    expect(line).not.toContain("01712345678");
    expect(line).not.toContain("০১৭১২৩৪৫৬৭৮");
    expect(JSON.parse(lines[0]!).dropped).toEqual(expect.arrayContaining(["err_code", "err_name"]));
  });
});

describe("describeError", () => {
  it("returns name, code token and the top real frame, skipping frames faked in the message", () => {
    const err = Object.assign(new Error(`bad ${PHONE}\n    at evil (${PHONE}:1:1)`), { code: "ECONNREFUSED" });
    const d = describeError(err);
    expect(d).toMatchObject({ err_name: "Error", err_code: "ECONNREFUSED" });
    expect(d.err_frame).toMatch(/^log\.test\.ts:\d+$/);
    expect(JSON.stringify(d)).not.toContain(PHONE);
  });

  it("returns nothing for non-errors and ignores non-string codes", () => {
    expect(describeError(PHONE)).toEqual({});
    expect(describeError(Object.assign(new Error("x"), { code: 42 })).err_code).toBeUndefined();
  });
});
