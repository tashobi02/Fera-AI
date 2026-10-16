// TASK-032: API-016/017/021 through the real route pipeline (src/app/api/admin/admin-routes.ts)
// with a fixed principal, a recording access.denied hook and fake services. Checks the
// E-001 / E-002 / E-003 / E-004 / E-007 / E-021 envelopes, the strict response schemas
// and the error mapping. Database behaviour is tests/db/admin.test.ts.
import { describe, expect, it } from "vitest";
import { errorEnvelopeSchema, type AnonymiseResponse } from "@/contracts";
import type { Principal } from "@/contracts/server";
import { ApiError } from "@/app/api/_shared";
import {
  anonymiseRoute,
  usersRoute,
  verifyRoute,
} from "@/app/api/admin/admin-routes";
import { RedactionDbError, RedactionForbiddenError } from "@/server/admin";
import { testUser } from "../support/principals";
import {
  captureLogs,
  get,
  jsonPost,
  noParams,
  testFactory,
} from "../api/fakes";

const ADMIN = testUser("6b1f3c2a-4d5e-4f60-8a71-000000000031", "admin");
const STAFF = testUser("6b1f3c2a-4d5e-4f60-8a71-000000000011", "staff");
const OFFICER_P = testUser("6b1f3c2a-4d5e-4f60-8a71-000000000021", "officer", {
  verified: true,
});
const UNVERIFIED = testUser("6b1f3c2a-4d5e-4f60-8a71-000000000022", "officer");
const INACTIVE_ADMIN = testUser(
  "6b1f3c2a-4d5e-4f60-8a71-000000000032",
  "admin",
  { isActive: false },
);
const TARGET = "6b1f3c2a-4d5e-4f60-8a71-000000000021";

const OK: AnonymiseResponse = {
  redacted: 3,
  skipped_not_eligible: 1,
  mode: "pseudonymisation",
  external_copies_removed: false,
};
const ALL = { all_eligible: true, confirmation: "বেনামী" };

async function envelope(res: Response) {
  const body = await res.json();
  return {
    status: res.status,
    id: errorEnvelopeSchema.parse(body).error.id,
    body,
  };
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });

describe("API-016 POST /api/admin/anonymise", () => {
  function setup(
    principal: Principal | null,
    redact = async (): Promise<AnonymiseResponse> => OK,
  ) {
    const f = testFactory(principal);
    const calls: unknown[] = [];
    const logs = captureLogs();
    const route = anonymiseRoute(
      f.defineRoute,
      async (p, body) => {
        calls.push(body);
        return redact();
      },
      logs.logger,
    );
    return { ...f, route, calls, serviceLogs: logs };
  }

  it("answers the strict AnonymiseResponse for an admin", async () => {
    const s = setup(ADMIN);
    const res = await s.route(jsonPost("/api/admin/anonymise", ALL), noParams);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(OK);
    expect(s.calls).toEqual([ALL]);
  });

  it.each([
    ["missing confirmation", { all_eligible: true }],
    ["wrong word", { all_eligible: true, confirmation: "anonymise" }],
    [
      "both selectors",
      { all_eligible: true, case_ids: [TARGET], confirmation: "বেনামী" },
    ],
    ["neither selector", { confirmation: "বেনামী" }],
    ["all_eligible false", { all_eligible: false, confirmation: "বেনামী" }],
  ])("E-001 for %s, before the service runs", async (_label, body) => {
    const s = setup(ADMIN);
    expect(
      await envelope(
        await s.route(jsonPost("/api/admin/anonymise", body), noParams),
      ),
    ).toMatchObject({ status: 400, id: "E-001" });
    expect(s.calls).toEqual([]);
    expect(s.audit).toEqual([]);
  });

  it.each([
    ["staff", STAFF],
    ["verified officer", OFFICER_P],
    ["unverified officer", UNVERIFIED],
  ])(
    "E-003 for %s, with one access.denied row and no service call",
    async (_label, principal) => {
      const s = setup(principal);
      expect(
        await envelope(
          await s.route(jsonPost("/api/admin/anonymise", ALL), noParams),
        ),
      ).toMatchObject({ status: 403, id: "E-003" });
      expect(s.calls).toEqual([]);
      expect(s.audit).toEqual([
        expect.objectContaining({
          api: "API-016",
          errorId: "E-003",
          reason: "role",
          caseId: null,
        }),
      ]);
    },
  );

  it("E-002 when signed out or inactive", async () => {
    for (const p of [null, INACTIVE_ADMIN]) {
      const s = setup(p);
      expect(
        await envelope(
          await s.route(jsonPost("/api/admin/anonymise", ALL), noParams),
        ),
      ).toMatchObject({ status: 401, id: "E-002" });
      expect(s.calls).toEqual([]);
    }
  });

  it("maps RedactionForbiddenError to E-003 with an access.denied row", async () => {
    const s = setup(ADMIN, async () => {
      throw new RedactionForbiddenError();
    });
    expect(
      await envelope(
        await s.route(jsonPost("/api/admin/anonymise", ALL), noParams),
      ),
    ).toMatchObject({ status: 403, id: "E-003" });
    expect(s.audit).toEqual([
      expect.objectContaining({
        api: "API-016",
        errorId: "E-003",
        reason: "authorize",
      }),
    ]);
  });

  it("maps RedactionDbError to E-021 and logs the SQLSTATE only", async () => {
    const s = setup(ADMIN, async () => {
      throw new RedactionDbError("42501", 1);
    });
    const out = await envelope(
      await s.route(jsonPost("/api/admin/anonymise", ALL), noParams),
    );
    expect(out).toMatchObject({ status: 500, id: "E-021" });
    const line = s.serviceLogs.parsed().find((l) => l.event === "db.refusal");
    expect(line).toMatchObject({
      route: "API-016",
      err_code: "42501",
      err_name: "RedactionDbError",
      error_id: "E-021",
    });
    expect(JSON.stringify(s.serviceLogs.parsed())).not.toMatch(
      /payload redaction failed/,
    );
  });

  it("an extra key from the service is never sent (strict response → E-021)", async () => {
    const s = setup(
      ADMIN,
      async () =>
        ({ ...OK, child_name: "Synthetic" }) as unknown as AnonymiseResponse,
    );
    expect(
      await envelope(
        await s.route(jsonPost("/api/admin/anonymise", ALL), noParams),
      ),
    ).toMatchObject({ status: 500, id: "E-021" });
  });

  it("is limited to 5 calls a minute per admin (E-007 with Retry-After)", async () => {
    const s = setup(ADMIN);
    for (let i = 0; i < 5; i++)
      expect(
        (await s.route(jsonPost("/api/admin/anonymise", ALL), noParams)).status,
      ).toBe(200);
    const res = await s.route(jsonPost("/api/admin/anonymise", ALL), noParams);
    expect(await envelope(res)).toMatchObject({ status: 429, id: "E-007" });
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(s.calls).toHaveLength(5);
  });

  it("refuses a cross-site POST (E-003) before anything else", async () => {
    const s = setup(ADMIN);
    const req = jsonPost("/api/admin/anonymise", ALL, {
      "sec-fetch-site": "cross-site",
    });
    expect(await envelope(await s.route(req, noParams))).toMatchObject({
      status: 403,
      id: "E-003",
    });
    expect(s.calls).toEqual([]);
  });
});

describe("API-017 POST /api/admin/users/:id/verify [MOCK]", () => {
  function setup(principal: Principal | null, impl?: () => Promise<unknown>) {
    const f = testFactory(principal);
    const calls: { id: string; body: unknown; requestId: unknown }[] = [];
    const route = verifyRoute(f.defineRoute, async (_p, id, body, ctx) => {
      calls.push({ id, body, requestId: ctx?.requestId });
      if (impl) return (await impl()) as never;
      return { id, role: "officer", verified: body.verified };
    });
    return { ...f, route, calls };
  }

  it("returns { id, role: officer, verified } and passes the request ID to the service", async () => {
    const s = setup(ADMIN);
    const res = await s.route(
      jsonPost(`/api/admin/users/${TARGET}/verify`, { verified: true }),
      params(TARGET.toUpperCase()),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      id: TARGET,
      role: "officer",
      verified: true,
    });
    expect(s.calls).toEqual([
      {
        id: TARGET,
        body: { verified: true },
        requestId: res.headers.get("x-request-id"),
      },
    ]);
  });

  it.each([
    ["bad id", "not-a-uuid", { verified: true }],
    ["missing flag", TARGET, {}],
    ["string flag", TARGET, { verified: "true" }],
  ])("E-001 for %s", async (_label, id, body) => {
    const s = setup(ADMIN);
    expect(
      await envelope(
        await s.route(
          jsonPost(`/api/admin/users/${id}/verify`, body),
          params(id),
        ),
      ),
    ).toMatchObject({ status: 400, id: "E-001" });
    expect(s.calls).toEqual([]);
  });

  it("E-003 for non-admins (role guard) with an access.denied row", async () => {
    for (const p of [STAFF, OFFICER_P, UNVERIFIED]) {
      const s = setup(p);
      expect(
        await envelope(
          await s.route(
            jsonPost(`/api/admin/users/${TARGET}/verify`, { verified: true }),
            params(TARGET),
          ),
        ),
      ).toMatchObject({ status: 403, id: "E-003" });
      expect(s.calls).toEqual([]);
      expect(s.audit).toEqual([
        expect.objectContaining({ api: "API-017", errorId: "E-003" }),
      ]);
    }
  });

  it("E-004 from the service (unknown or non-officer target) is enveloped and audited without a case FK", async () => {
    const s = setup(ADMIN, async () => {
      throw new ApiError("E-004");
    });
    expect(
      await envelope(
        await s.route(
          jsonPost(`/api/admin/users/${TARGET}/verify`, { verified: true }),
          params(TARGET),
        ),
      ),
    ).toMatchObject({ status: 404, id: "E-004" });
    expect(s.audit).toEqual([
      expect.objectContaining({
        api: "API-017",
        errorId: "E-004",
        caseId: null,
      }),
    ]);
  });

  it("a response that is not exactly the contract (role other than officer, extra key) is E-021", async () => {
    for (const bad of [
      { id: TARGET, role: "staff", verified: false },
      { id: TARGET, role: "officer", verified: true, password_hash: "x" },
    ]) {
      const s = setup(ADMIN, async () => bad);
      expect(
        await envelope(
          await s.route(
            jsonPost(`/api/admin/users/${TARGET}/verify`, { verified: true }),
            params(TARGET),
          ),
        ),
      ).toMatchObject({ status: 500, id: "E-021" });
    }
  });
});

describe("API-021 GET /api/admin/users", () => {
  const page = {
    users: [
      {
        id: TARGET,
        username: "officer.demo",
        display_name: "[MOCK] কর্মকর্তা",
        role: "officer" as const,
        verified: true,
        is_active: true,
      },
      {
        id: "6b1f3c2a-4d5e-4f60-8a71-000000000011",
        username: "staff.demo",
        display_name: "[MOCK] স্টাফ",
        role: "staff" as const,
        verified: false,
        is_active: true,
      },
    ],
    next_cursor: null,
  };

  function setup(
    principal: Principal | null,
    impl: () => Promise<unknown> = async () => page,
  ) {
    const f = testFactory(principal);
    const queries: unknown[] = [];
    const route = usersRoute(f.defineRoute, async (_p, query) => {
      queries.push(query);
      return (await impl()) as never;
    });
    return { ...f, route, queries };
  }

  it("returns the strict AdminUsersResponse and parses limit/cursor", async () => {
    const s = setup(ADMIN);
    const res = await s.route(get("/api/admin/users?limit=2"), noParams);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(page);
    expect(s.queries).toEqual([{ limit: 2 }]);
  });

  it("E-001 for a bad limit or a malformed cursor", async () => {
    for (const q of ["limit=0", "limit=51", "limit=x", "cursor=short"]) {
      const s = setup(ADMIN);
      expect(
        await envelope(await s.route(get(`/api/admin/users?${q}`), noParams)),
      ).toMatchObject({ status: 400, id: "E-001" });
      expect(s.queries).toEqual([]);
    }
  });

  it("E-003 for non-admins, E-002 signed out", async () => {
    const s = setup(OFFICER_P);
    expect(
      await envelope(await s.route(get("/api/admin/users"), noParams)),
    ).toMatchObject({ status: 403, id: "E-003" });
    expect(
      await envelope(
        await setup(null).route(get("/api/admin/users"), noParams),
      ),
    ).toMatchObject({ status: 401, id: "E-002" });
  });

  it("never sends a password hash, session or extra field (strict schema → E-021)", async () => {
    for (const extra of [
      { password_hash: "$argon2id$x" },
      { session: "s" },
      { district_code: 1 },
    ]) {
      const s = setup(ADMIN, async () => ({
        ...page,
        users: [{ ...page.users[0], ...extra }],
      }));
      expect(
        await envelope(await s.route(get("/api/admin/users"), noParams)),
      ).toMatchObject({ status: 500, id: "E-021" });
    }
  });
});
