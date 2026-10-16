// TASK-063 / BR-023 / TC-036/043/065. Synthetic metadata, local PG16, fera_app.
import { randomUUID } from "node:crypto";
import type { Client, Pool, PoolClient } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createMissingRequestSchema, errorEnvelope } from "@/contracts";
import { exampleCreateMissingRequest } from "@/contracts/examples";
import { createMissingCase } from "@/server/case";
import { PaidProviderFailure, reservePaidCall, runPaidCall, type ReservationRequest } from "@/server/spend";
import { settlePaidCall } from "@/server/spend/service";
import { testParent, testUser } from "../support/principals";
import { mockEstimate } from "../spend/estimates";
import { connect, createActors, dbTestsEnabled, MOCK_DISTRICT, one, pool, seedReference, type Actors } from "./support/db";

describe.skipIf(!dbTestsEnabled)("paid-call reservations on PostgreSQL 16 as fera_app (TASK-063)", () => {
  let admin: Client;
  let appClient: Client;
  let app: Pool;
  let app2: Pool;
  let actors: Actors;
  const ctx = () => ({ pool: app });

  beforeAll(async () => {
    admin = await connect("admin");
    appClient = await connect("app");
    app = pool("app");
    app2 = pool("app");
    // Local to this suite: ten contenders must not queue through the harness's max:2.
    app.options.max = 10;
    app2.options.max = 10;
    await seedReference(admin);
    actors = await createActors(admin);
  });
  beforeEach(async () => {
    await admin.query("DELETE FROM ai_calls");
    await admin.query("DELETE FROM ai_reservations");
    await admin.query("DELETE FROM intake_drafts");
    await admin.query("UPDATE ai_budget SET cap_usd=25, committed_usd=0, reserved_usd=0");
  });
  afterAll(async () => { await Promise.all([admin?.end(), appClient?.end(), app?.end(), app2?.end()]); });

  const draft = async (expired = false) => {
    const session = await one<{ id: string }>(appClient, "INSERT INTO parent_sessions DEFAULT VALUES RETURNING id");
    const d = await one<{ id: string }>(appClient,
      `INSERT INTO intake_drafts (session_id, kind, created_at, expires_at) VALUES ($1, 'missing', now()-interval '2 days', ${expired ? "now()-interval '1 day'" : "now()+interval '1 day'"}) RETURNING id`, [session.id]);
    return { id: d.id, principal: testParent(session.id) };
  };
  const input = (id: string, expectedRevision = 1, upperUsd = "0.010000"): ReservationRequest => ({ apiId: "API-002", draftId: id, expectedRevision, upperUsd: mockEstimate(upperUsd) });
  const budget = () => one<{ cap: string; committed: string; reserved: string }>(appClient, "SELECT cap_usd::text AS cap, committed_usd::text AS committed, reserved_usd::text AS reserved FROM ai_budget");
  const used = (id: string) => one<{ calls: number; revision: number; reservations: number }>(appClient,
    "SELECT ai_calls_used AS calls, revision, (SELECT count(*)::int FROM ai_reservations WHERE draft_id=$1) AS reservations FROM intake_drafts WHERE id=$1", [id]);

  it("uses PG16 and the restricted role with the unraised USD 25 cap", async () => {
    expect((await one<{ role: string }>(appClient, "SELECT current_user AS role")).role).toBe("fera_app");
    expect((await appClient.query("SHOW server_version")).rows[0].server_version).toMatch(/^16\./);
    expect((await budget()).cap).toBe("25.000000");
  });

  it("refuses the seventh reservation and never refunds the draft count", async () => {
    const d = await draft();
    for (let revision = 1; revision <= 6; revision++) {
      const r = await reservePaidCall(d.principal, input(d.id, revision), ctx());
      await settlePaidCall(r.id, "0", ctx());
    }
    await expect(reservePaidCall(d.principal, input(d.id, 7), ctx())).rejects.toMatchObject({ id: "E-023" });
    expect(await used(d.id)).toEqual({ calls: 6, revision: 7, reservations: 6 });
  });

  it("ten concurrent raw SQL reservations never exceed six", async () => {
    const d = await draft();
    const clients: PoolClient[] = [];
    try {
      for (let i = 0; i < 10; i++) clients.push(await app.connect());
      const pids = await Promise.all(clients.map((c) => c.query("SELECT pg_backend_pid() AS pid")));
      expect(new Set(pids.map((r) => r.rows[0].pid)).size).toBe(10);
      const results = await Promise.allSettled(clients.map((c) => c.query("SELECT reserve_ai_call($1,$2)", [d.id, "0.010000"])));
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(6);
      expect(results.filter((r) => r.status === "rejected")).toHaveLength(4);
    } finally {
      clients.forEach((c) => c.release());
    }
    expect(await used(d.id)).toEqual({ calls: 6, revision: 7, reservations: 6 });
    expect((await budget()).reserved).toBe("0.060000");
  });

  it("concurrent replays from independent pools reserve only once", async () => {
    const d = await draft();
    const results = await Promise.allSettled(Array.from({ length: 10 }, (_, i) => reservePaidCall(d.principal, input(d.id), { pool: i % 2 ? app : app2 })));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(9);
    expect(await used(d.id)).toEqual({ calls: 1, revision: 2, reservations: 1 });
    expect((await budget()).reserved).toBe("0.010000");
  });

  it("distinct expected revisions 1..10 race without reusing a successful revision", async () => {
    const d = await draft();
    const results = await Promise.allSettled(Array.from({ length: 10 }, (_, i) => reservePaidCall(d.principal, input(d.id, i + 1), ctx())));
    expect(app.totalCount).toBe(10);
    const successes = results.flatMap((r, i) => {
      if (r.status === "rejected") {
        expect(r.reason).toMatchObject({ id: "E-023" });
        return [];
      }
      expect(r.value.revision).toBe(i + 2);
      return [r.value];
    });
    expect(successes.length).toBeGreaterThanOrEqual(1);
    expect(successes.length).toBeLessThanOrEqual(6);
    expect(new Set(successes.map((r) => r.id)).size).toBe(successes.length);
    expect(successes.map((r) => r.revision).sort((a, b) => a - b)).toEqual(Array.from({ length: successes.length }, (_, i) => i + 2));
    expect(await used(d.id)).toEqual({ calls: successes.length, revision: successes.length + 1, reservations: successes.length });
    expect((await budget()).reserved).toBe(`0.${String(successes.length * 10_000).padStart(6, "0")}`);
  });

  it("refuses a replay after settlement without double charging", async () => {
    const d = await draft();
    const r = await reservePaidCall(d.principal, input(d.id), ctx());
    await settlePaidCall(r.id, "0.004000", ctx());
    await expect(reservePaidCall(d.principal, input(d.id), { pool: app2 })).rejects.toMatchObject({ id: "E-023" });
    expect(await used(d.id)).toEqual({ calls: 1, revision: 2, reservations: 1 });
    expect(await budget()).toMatchObject({ committed: "0.004000", reserved: "0.000000" });
  });

  it("rolls back draft usage on a cap refusal", async () => {
    const d = await draft();
    await admin.query("UPDATE ai_budget SET committed_usd=cap_usd");
    await expect(reservePaidCall(d.principal, input(d.id), ctx())).rejects.toMatchObject({ id: "E-023" });
    expect(await used(d.id)).toEqual({ calls: 0, revision: 1, reservations: 0 });
  });

  it("concurrent drafts cannot reserve more than the global headroom", async () => {
    await admin.query("UPDATE ai_budget SET committed_usd=24.97");
    const drafts = [];
    for (let i = 0; i < 10; i++) drafts.push(await draft());
    const results = await Promise.allSettled(drafts.map((d, i) => reservePaidCall(d.principal, input(d.id), { pool: i % 2 ? app : app2 })));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);
    expect(await budget()).toMatchObject({ committed: "24.970000", reserved: "0.030000" });
  });

  it("settles once; duplicate identical settlement is idempotent, conflicting settlement refused", async () => {
    const d = await draft();
    const r = await reservePaidCall(d.principal, input(d.id, 1, "0.100000"), ctx());
    await Promise.all([settlePaidCall(r.id, "0.030000", ctx()), settlePaidCall(r.id, "0.030000", { pool: app2 })]);
    await expect(settlePaidCall(r.id, "0.040000", ctx())).rejects.toMatchObject({ id: "E-013" });
    expect(await budget()).toMatchObject({ committed: "0.030000", reserved: "0.000000" });
    expect(await used(d.id)).toMatchObject({ calls: 1 });
  });

  it("retains the reservation when actual cost exceeds its bound", async () => {
    const d = await draft();
    const r = await reservePaidCall(d.principal, input(d.id), ctx());
    await expect(settlePaidCall(r.id, "0.020000", ctx())).rejects.toMatchObject({ id: "E-013" });
    expect((await budget()).reserved).toBe("0.010000");
  });

  it("refuses missing, expired and foreign drafts without leaving reservations", async () => {
    const expired = await draft(true);
    const own = await draft();
    const other = await draft();
    for (const id of [randomUUID(), expired.id, other.id]) {
      await expect(reservePaidCall(own.principal, input(id), ctx())).rejects.toMatchObject({ id: "E-023" });
    }
    expect((await used(expired.id)).calls).toBe(0);
    expect((await used(other.id)).calls).toBe(0);
    expect((await budget()).reserved).toBe("0.000000");
  });

  it.each(["parent-found", "user-missing"] as const)("refuses an owned draft with the wrong kind (%s)", async (scenario) => {
    const parent = await draft();
    const sessionId = parent.principal.kind === "parent" ? parent.principal.sessionId : null;
    const wrong = await one<{ id: string }>(appClient,
      "INSERT INTO intake_drafts (session_id, user_id, kind) VALUES ($1,$2,$3) RETURNING id",
      scenario === "parent-found" ? [sessionId, null, "found"] : [null, actors.staff, "missing"]);
    const actor = scenario === "parent-found" ? parent.principal : testUser(actors.staff, "staff");
    await expect(reservePaidCall(actor, input(wrong.id), ctx())).rejects.toMatchObject({ id: "E-023" });
    expect(await used(wrong.id)).toEqual({ calls: 0, revision: 1, reservations: 0 });
    expect((await budget()).reserved).toBe("0.000000");
  });

  it("allows API-007 only for the staff member's own found draft", async () => {
    const d = await one<{ id: string }>(appClient, "INSERT INTO intake_drafts (user_id, kind) VALUES ($1, 'found') RETURNING id", [actors.staff]);
    await expect(reservePaidCall(testUser(actors.staff, "staff"), { ...input(d.id), apiId: "API-007" }, ctx())).resolves.toMatchObject({ draftId: d.id, revision: 2 });
  });

  it.each(["0.020000", "[MOCK] malformed actual"])("keeps paid output and reserved budget for unusable actualUsd %s", async (actualUsd) => {
    const d = await draft();
    await expect(runPaidCall(d.principal, input(d.id), async () => ({ value: "[MOCK] paid", actualUsd }), { ...ctx(), timeoutMs: 1000 })).resolves.toMatchObject({ value: "[MOCK] paid", settlement: "unsettled" });
    expect(await budget()).toMatchObject({ reserved: "0.010000", committed: "0.000000" });
    expect(await used(d.id)).toEqual({ calls: 1, revision: 2, reservations: 1 });
  });

  it("retains uncertain failed usage and counts a separate fallback reservation", async () => {
    const d = await draft();
    await expect(runPaidCall(d.principal, input(d.id), async () => { throw new Error("[MOCK] unknown bill"); }, { ...ctx(), timeoutMs: 1000 })).rejects.toMatchObject({ id: "E-013", settlement: "retained" });
    await runPaidCall(d.principal, input(d.id, 2), async () => ({ value: "[MOCK]", actualUsd: "0.004000" }), { ...ctx(), timeoutMs: 1000 });
    expect(await used(d.id)).toEqual({ calls: 2, revision: 3, reservations: 2 });
    expect(await budget()).toMatchObject({ reserved: "0.010000", committed: "0.004000" });
  });

  it("releases known unbilled usage without restoring a paid-call slot", async () => {
    const d = await draft();
    await expect(runPaidCall(d.principal, input(d.id), async () => { throw new PaidProviderFailure("E-013", "0"); }, { ...ctx(), timeoutMs: 1000 })).rejects.toMatchObject({ settlement: "settled" });
    expect(await used(d.id)).toEqual({ calls: 1, revision: 2, reservations: 1 });
    expect(await budget()).toMatchObject({ reserved: "0.000000", committed: "0.000000" });
  });

  it.each(["budget", "six-call"])("a %s refusal leaves reviewed manual submission usable through the real case service", async (limit) => {
    const d = await draft();
    if (limit === "budget") {
      await admin.query("UPDATE ai_budget SET committed_usd=cap_usd");
    } else {
      for (let revision = 1; revision <= 6; revision++) await reservePaidCall(d.principal, input(d.id, revision), ctx());
    }
    const count = limit === "budget" ? 0 : 6;
    await expect(reservePaidCall(d.principal, input(d.id, count + 1), ctx())).rejects.toMatchObject({ id: "E-023" });
    expect(errorEnvelope("E-023").error.fallback).toBe("manual_form");
    const deviceDraft = createMissingRequestSchema.parse({
      ...structuredClone(exampleCreateMissingRequest),
      draft: { ...exampleCreateMissingRequest.draft, event: { ...exampleCreateMissingRequest.draft.event, district_code: MOCK_DISTRICT } },
    });
    const before = structuredClone(deviceDraft);
    const result = await createMissingCase(d.principal, createMissingRequestSchema.parse({ ...deviceDraft, client_submission_id: randomUUID() }), ctx());
    expect(result.case.status).toBe("submitted");
    expect(deviceDraft).toEqual(before);
    expect(await used(d.id)).toEqual({ calls: count, revision: count + 1, reservations: count });
  });
});
