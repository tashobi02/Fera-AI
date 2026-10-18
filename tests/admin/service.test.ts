// TASK-032: admin services with scripted pg fakes (no database). Role refusals happen
// before any query; the verification write and its audit row share one transaction;
// API-021 selects only AdminUserView columns and signs its cursor.
import { describe, expect, it } from "vitest";
import {
  RedactionDbError,
  RedactionForbiddenError,
  countEligibleCases,
  decodeUsersCursor,
  encodeUsersCursor,
  listAdminUsers,
  setOfficerVerified,
} from "@/server/admin";
import { fakePool } from "../case/fakes";
import { testUser } from "../support/principals";

const ADMIN_ID = "6b1f3c2a-4d5e-4f60-8a71-000000000031";
const OFFICER_ID = "6b1f3c2a-4d5e-4f60-8a71-000000000021";
const ADMIN = testUser(ADMIN_ID, "admin");
const KEY = Buffer.alloc(32, 7);
const untouchable = {
  query: () => Promise.reject(new Error("pool must not be used")),
  connect: () => Promise.reject(new Error("pool must not be used")),
};

const nonAdmins = [
  testUser("6b1f3c2a-4d5e-4f60-8a71-000000000011", "staff"),
  testUser(OFFICER_ID, "officer", { verified: true }),
  testUser(OFFICER_ID, "officer"),
  testUser(ADMIN_ID, "admin", { isActive: false }),
];

describe("setOfficerVerified (API-017 [MOCK])", () => {
  const verifyPool = (
    target: { role: string; verified: boolean } | null,
    adminActive = true,
  ) =>
    fakePool([
      {
        match: /FROM users WHERE id = \$1 AND role = 'admin'/,
        reply: () => (adminActive ? [{ id: ADMIN_ID }] : []),
      },
      {
        match: /SELECT id, role::text AS role, verified FROM users/,
        reply: () => (target ? [{ id: OFFICER_ID, ...target }] : []),
      },
      { match: /INSERT INTO audit_log/, reply: () => [{ id: "41" }] },
    ]);

  it("refuses non-admins with E-003 before connecting", async () => {
    for (const p of nonAdmins) {
      await expect(
        setOfficerVerified(
          p,
          OFFICER_ID,
          { verified: true },
          { pool: untouchable as never },
        ),
      ).rejects.toMatchObject({ id: "E-003" });
    }
  });

  it("updates the flag and writes one admin audit row in the same transaction", async () => {
    const f = verifyPool({ role: "officer", verified: false });
    const out = await setOfficerVerified(
      ADMIN,
      OFFICER_ID.toUpperCase(),
      { verified: true },
      { pool: f.pool, requestId: "6b1f3c2a-4d5e-4f60-8a71-0000000000aa" },
    );
    expect(out).toEqual({ id: OFFICER_ID, role: "officer", verified: true });
    const texts = f.calls.map((c) =>
      c.text.trim().split(/\s+/).slice(0, 2).join(" "),
    );
    expect(texts).toEqual([
      "BEGIN",
      "SELECT id",
      "SELECT id,",
      "UPDATE users",
      "INSERT INTO",
      "SET CONSTRAINTS",
      "COMMIT",
    ]);
    expect(f.sent(/FOR SHARE/)[0].values).toEqual([ADMIN_ID]);
    expect(f.sent(/FOR NO KEY UPDATE/)[0].values).toEqual([OFFICER_ID]);
    expect(f.sent(/UPDATE users SET verified/)[0].values).toEqual([
      OFFICER_ID,
      true,
    ]);
    const audit = f.sent(/INSERT INTO audit_log/)[0].values;
    expect(audit.slice(0, 5)).toEqual([
      "admin",
      ADMIN_ID,
      null,
      "user.verification_changed",
      null,
    ]);
    expect(JSON.parse(String(audit[6]))).toEqual({
      api: "API-017",
      verified: true,
      target_role: "officer",
      target_user_id: OFFICER_ID,
    });
    expect(audit[7]).toBe("6b1f3c2a-4d5e-4f60-8a71-0000000000aa");
  });

  it("setting the value it already has writes nothing", async () => {
    const f = verifyPool({ role: "officer", verified: true });
    expect(
      await setOfficerVerified(
        ADMIN,
        OFFICER_ID,
        { verified: true },
        { pool: f.pool },
      ),
    ).toEqual({ id: OFFICER_ID, role: "officer", verified: true });
    expect(f.sent(/UPDATE users|INSERT INTO audit_log/)).toEqual([]);
  });

  it.each([["staff"], ["admin"]])(
    "refuses a %s target with E-004 and rolls back",
    async (role) => {
      const f = verifyPool({ role, verified: false });
      await expect(
        setOfficerVerified(
          ADMIN,
          OFFICER_ID,
          { verified: true },
          { pool: f.pool },
        ),
      ).rejects.toMatchObject({ id: "E-004" });
      expect(f.sent(/UPDATE users|INSERT INTO audit_log/)).toEqual([]);
      expect(f.sent(/ROLLBACK/)).toHaveLength(1);
    },
  );

  it("E-004 for an unknown or malformed target", async () => {
    await expect(
      setOfficerVerified(
        ADMIN,
        OFFICER_ID,
        { verified: true },
        { pool: verifyPool(null).pool },
      ),
    ).rejects.toMatchObject({ id: "E-004" });
    await expect(
      setOfficerVerified(
        ADMIN,
        "nope",
        { verified: true },
        { pool: untouchable as never },
      ),
    ).rejects.toMatchObject({ id: "E-004" });
  });

  it("E-003 when the admin was deactivated after the session was read", async () => {
    const f = verifyPool({ role: "officer", verified: false }, false);
    await expect(
      setOfficerVerified(
        ADMIN,
        OFFICER_ID,
        { verified: true },
        { pool: f.pool },
      ),
    ).rejects.toMatchObject({ id: "E-003" });
    expect(f.sent(/FOR NO KEY UPDATE|UPDATE users/)).toEqual([]);
  });

  it("an audit failure fails the whole change (no UPDATE without its audit row)", async () => {
    const f = fakePool([
      { match: /role = 'admin'/, reply: () => [{ id: ADMIN_ID }] },
      {
        match: /SELECT id, role::text/,
        reply: () => [{ id: OFFICER_ID, role: "officer", verified: false }],
      },
      {
        match: /INSERT INTO audit_log/,
        reply: () => new Error("insert failed"),
      },
    ]);
    await expect(
      setOfficerVerified(
        ADMIN,
        OFFICER_ID,
        { verified: true },
        { pool: f.pool, attempts: 1 },
      ),
    ).rejects.toThrow();
    expect(f.sent(/COMMIT/)).toEqual([]);
    expect(f.sent(/ROLLBACK/)).toHaveLength(1);
  });
});

describe("listAdminUsers (API-021)", () => {
  const row = (username: string) => ({
    id: OFFICER_ID,
    username,
    display_name: "[MOCK] কর্মকর্তা",
    role: "officer",
    verified: true,
    is_active: true,
  });

  it("refuses non-admins before any query", async () => {
    for (const p of nonAdmins)
      await expect(
        listAdminUsers(p, {}, { pool: untouchable, key: KEY }),
      ).rejects.toMatchObject({ id: "E-003" });
  });

  it("selects only the AdminUserView columns, never the hash", async () => {
    const sent: string[] = [];
    const pool = {
      query: async (text: string) => (
        sent.push(text),
        { rows: [row("officer.demo")] }
      ),
    };
    const out = await listAdminUsers(ADMIN, {}, { pool, key: KEY });
    expect(out).toEqual({ users: [row("officer.demo")], next_cursor: null });
    expect(sent[0]).toMatch(
      /SELECT id, username, display_name, role::text AS role, verified, is_active FROM users/,
    );
    expect(sent[0]).not.toMatch(/password|session|cases/);
  });

  it("pages by username with a signed cursor that round-trips", async () => {
    const seen: unknown[][] = [];
    const pool = {
      query: async (_t: string, values?: unknown[]) => (
        seen.push(values ?? []),
        { rows: [row("a.one"), row("b.two"), row("c.three")] }
      ),
    };
    const first = await listAdminUsers(ADMIN, { limit: 2 }, { pool, key: KEY });
    expect(first.users.map((u) => u.username)).toEqual(["a.one", "b.two"]);
    expect(seen[0]).toEqual([null, 3]);
    expect(first.next_cursor).not.toBeNull();
    expect(decodeUsersCursor(first.next_cursor!, KEY)).toBe("b.two");
    await listAdminUsers(
      ADMIN,
      { limit: 2, cursor: first.next_cursor! },
      { pool, key: KEY },
    );
    expect(seen[1]).toEqual(["b.two", 3]);
  });

  it("E-001 for a cursor signed with another key or tampered with", async () => {
    const forged = encodeUsersCursor("zzz", Buffer.alloc(32, 9));
    await expect(
      listAdminUsers(
        ADMIN,
        { cursor: forged },
        { pool: untouchable, key: KEY },
      ),
    ).rejects.toMatchObject({ id: "E-001" });
    const good = encodeUsersCursor("b.two", KEY);
    const [payload, sig] = good.split(".");
    const tampered = `${Buffer.from(JSON.stringify({ v: 1, after: "a" })).toString("base64url")}.${sig}`;
    expect(decodeUsersCursor(tampered, KEY)).toBeNull();
    expect(decodeUsersCursor(`${payload}.${sig}.x`, KEY)).toBeNull();
    expect(decodeUsersCursor(good, KEY)).toBe("b.two");
  });

  it("fails closed on a row that is not a valid AdminUserView", async () => {
    const pool = {
      query: async () => ({ rows: [{ ...row("x.y"), role: "parent" }] }),
    };
    await expect(
      listAdminUsers(ADMIN, {}, { pool, key: KEY }),
    ).rejects.toThrow();
    const unverifiable = {
      query: async () => ({
        rows: [{ ...row("x.y"), role: "staff", verified: true }],
      }),
    };
    await expect(
      listAdminUsers(ADMIN, {}, { pool: unverifiable, key: KEY }),
    ).rejects.toThrow();
  });
});

describe("countEligibleCases (SCREEN-013 summary)", () => {
  it("refuses non-admins before any query", async () => {
    for (const p of [...nonAdmins, null])
      await expect(
        countEligibleCases(untouchable as never, p),
      ).rejects.toBeInstanceOf(RedactionForbiddenError);
  });

  it("fails closed on a pool that is not fera_redactor", async () => {
    const pool = { query: async () => ({ rows: [{ role: "fera_app" }] }) };
    await expect(countEligibleCases(pool as never, ADMIN)).rejects.toEqual(
      new RedactionDbError(null, 0),
    );
  });
});
