// TASK-023 API-006 outputs on PostgreSQL 16 as the restricted fera_app role (COMP-010;
// BR-022 cache per case/type/version, TC-005). Synthetic data only. Runs under
// `npm run test:db` on a fresh per-run database; skipped in plain `npm test`.
import { randomUUID } from "node:crypto";
import type { Client, Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ApiError } from "@/app/api/_shared";
import { createMissingRequestSchema, outputResponseSchema, updateCaseRequestSchema } from "@/contracts";
import { exampleCreateMissingRequest } from "@/contracts/examples";
import { createMissingCase, editMissingCase, openCase } from "@/server/case";
import { setPoolForTests } from "@/server/db/pool";
import { getOutput } from "@/server/outputs";
import { testParent } from "../support/principals";
import { MOCK_DISTRICT, connect, dbTestsEnabled, fakePhone, one, pool, seedReference } from "./support/db";

describe.skipIf(!dbTestsEnabled)("API-006 outputs on PostgreSQL 16 (TASK-023)", () => {
  let admin: Client;
  let appClient: Client;
  let app: Pool;
  const ctx = () => ({ pool: app });

  beforeAll(async () => {
    admin = await connect("admin");
    appClient = await connect("app");
    app = pool("app");
    setPoolForTests(app);
    await seedReference(admin);
  });

  afterAll(async () => {
    setPoolForTests(null);
    await Promise.all([admin?.end(), appClient?.end(), app?.end()]);
  });

  const newParent = async () => testParent((await one<{ id: string }>(appClient, "INSERT INTO parent_sessions DEFAULT VALUES RETURNING id")).id);

  const draft = (marks: string | null = null) =>
    createMissingRequestSchema.parse({
      ...exampleCreateMissingRequest,
      client_submission_id: randomUUID(),
      draft: {
        ...exampleCreateMissingRequest.draft,
        child: { ...exampleCreateMissingRequest.draft.child, marks },
        event: { ...exampleCreateMissingRequest.draft.event, district_code: MOCK_DISTRICT },
        reporter: { ...exampleCreateMissingRequest.draft.reporter, phone: fakePhone() },
      },
    });

  const openReport = async () => {
    const parent = await newParent();
    const req = draft();
    const created = await createMissingCase(parent, req, ctx());
    await openCase(parent, created.case.id, ctx());
    return { parent, id: created.case.id, req };
  };

  const stored = async (id: string) =>
    (await appClient.query("SELECT type, case_version FROM generated_outputs WHERE case_id = $1 ORDER BY case_version, type", [id])).rows;

  it("stores one GD per version, reuses it, and fills the reviewed district (TC-005)", async () => {
    const { parent, id, req } = await openReport();
    const first = await getOutput(parent, id, "gd", ctx());
    expect(outputResponseSchema.parse(first)).toEqual(first);
    expect(first.text_bn).toContain("জেলা: [MOCK] জেলা ০১");
    expect(first.text_bn).toContain("শিশুর নাম: মিতু");

    const again = await getOutput(parent, id, "gd", ctx());
    expect(again).toEqual(first);
    await getOutput(parent, id, "poster", ctx());
    expect(await stored(id)).toEqual([{ type: "gd", case_version: 1 }, { type: "poster", case_version: 1 }]);

    // An owner edit bumps the version: the old text is never served as current.
    const edit = updateCaseRequestSchema.parse({ draft: { ...draft("[MOCK] কপালে দাগ").draft, reporter: req.draft.reporter }, confirmed: true, expected_version: 1 });
    await editMissingCase(parent, id, edit, ctx());
    const edited = await getOutput(parent, id, "gd", ctx());
    expect(edited.text_bn).toContain("শনাক্তকরণ চিহ্ন: [MOCK] কপালে দাগ");
    expect(first.text_bn).not.toContain("[MOCK] কপালে দাগ");
    expect((await stored(id)).filter((r) => r.type === "gd").map((r) => r.case_version)).toEqual([1, 2]);
  });

  it("keeps one row when two requests race", async () => {
    const { parent, id } = await openReport();
    const [a, b] = await Promise.all([getOutput(parent, id, "poster", ctx()), getOutput(parent, id, "poster", ctx())]);
    expect(a).toEqual(b);
    expect(await stored(id)).toHaveLength(1);
  });

  it("waits for a concurrent change to the case and then writes nothing (redaction/edit race)", async () => {
    const { parent, id } = await openReport();
    // Stand-in for redact_case or an owner edit: hold the case row locked with a version bump.
    await admin.query("BEGIN");
    await admin.query("UPDATE cases SET version = version + 1 WHERE id = $1", [id]);
    const pending = getOutput(parent, id, "gd", ctx()).catch((e: unknown) => e);
    // Commit only once getOutput is blocked on the case row lock.
    for (let i = 0; i < 100; i++) {
      const { rows } = await admin.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND datname = current_database()");
      if (rows[0].n > 0) break;
      await new Promise((r) => setTimeout(r, 20));
    }
    await admin.query("COMMIT");
    const err = await pending;
    expect((err as ApiError).id).toBe("E-016");
    expect(await stored(id)).toHaveLength(0);
  });

  it("answers E-004 to another parent and stores nothing", async () => {
    const { id } = await openReport();
    const err = await getOutput(await newParent(), id, "gd", ctx()).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).id).toBe("E-004");
    expect(await stored(id)).toHaveLength(0);
    const malformed = await getOutput(await newParent(), "not-a-uuid", "gd", ctx()).catch((e: unknown) => e);
    expect((malformed as ApiError).id).toBe("E-004");
  });
});
