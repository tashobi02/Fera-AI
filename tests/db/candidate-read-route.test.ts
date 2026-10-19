// API-009 malformed candidate IDs must be hidden and audited like absent IDs
// (BR-010, D2A API-009). Exercise the exported route with a real local DB.
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { errorEnvelopeSchema } from "@/contracts";
import { userPrincipal } from "@/contracts/server";
import { GET } from "@/app/api/candidates/[id]/route";
import { defaultAuth } from "@/server/auth/default";
import { setPoolForTests } from "@/server/db/pool";
import { dbTestsEnabled, pool } from "./support/db";

describe.skipIf(!dbTestsEnabled)("API-009 candidate read denial (BR-010)", () => {
  let ownerPool: Pool;
  let appPool: Pool;
  let officerId: string;

  beforeAll(async () => {
    ownerPool = pool("admin");
    appPool = pool("app");
    setPoolForTests(appPool);
    officerId = randomUUID();
    await ownerPool.query(
      `INSERT INTO users (id, role, username, display_name, password_hash, verified, is_active)
       VALUES ($1, 'officer', $2, '[MOCK] Officer', '$argon2id$v=19$m=19456,t=2,p=1$aaaaaaaaaaaaaaaaaaaaaa$bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', true, true)`,
      [officerId, `candidate_officer_${officerId.slice(0, 8)}`],
    );
  });

  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => {
    setPoolForTests(null);
    if (appPool) await appPool.end();
    if (ownerPool) await ownerPool.end();
  });

  it("returns E-004 and writes a nullable-FK access.denied row", async () => {
    const principal = userPrincipal({ id: officerId, role: "officer", verified: true, is_active: true });
    expect(principal).not.toBeNull();
    vi.spyOn(defaultAuth(), "resolvePrincipal").mockResolvedValue(principal);
    const id = "not-a-uuid";
    const response = await GET(new Request(`http://localhost/api/candidates/${id}`), {
      params: Promise.resolve({ id }),
    });
    expect(response.status).toBe(404);
    expect(errorEnvelopeSchema.parse(await response.json()).error.id).toBe("E-004");
    const { rows } = await appPool.query<{ case_id: string | null; details: { api?: string; error_id?: string } }>(
      `SELECT case_id, details FROM audit_log WHERE action = 'access.denied' AND actor_user_id = $1 ORDER BY id DESC LIMIT 1`,
      [officerId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].case_id).toBeNull();
    expect(rows[0].details).toEqual({ api: "API-009", error_id: "E-004" });
  });
});
