// T-10: expired anonymous metadata is bounded without deleting retained audit,
// spend history, or a draft still pinned by an unresolved paid-call reservation.
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect, dbTestsEnabled, insertMissing, one, seedReference } from "./support/db";

describe.skipIf(!dbTestsEnabled)("expired metadata sweep", () => {
  let admin: Client;
  let app: Client;

  beforeAll(async () => {
    admin = await connect("admin");
    app = await connect("app");
    await seedReference(admin);
  });

  afterAll(async () => {
    await Promise.all([admin?.end(), app?.end()]);
  });

  it("removes expired drafts and unreferenced sessions while preserving audit and active reservations", async () => {
    const now = new Date();
    const oldCreated = new Date(now.getTime() - 40 * 86_400_000);
    const oldDraftExpiry = new Date(now.getTime() - 2 * 86_400_000);
    const oldSessionExpiry = new Date(now.getTime() - 8 * 86_400_000);

    const oldSession = await one<{ id: string }>(app, "INSERT INTO parent_sessions DEFAULT VALUES RETURNING id");
    const oldDraft = await one<{ id: string }>(app,
      "INSERT INTO intake_drafts (session_id, kind) VALUES ($1, 'missing') RETURNING id", [oldSession.id]);
    const settled = await one<{ id: string }>(app, "SELECT reserve_ai_call($1, 0.010000) AS id", [oldDraft.id]);
    await app.query("SELECT settle_ai_call($1, 0.004000)", [settled.id]);
    await app.query(
      `INSERT INTO ai_calls (draft_id, reservation_id, operation, provider, model, duration_ms, ok)
       VALUES ($1, $2, 'extract', 'synthetic', 'test-model', 1, true)`,
      [oldDraft.id, settled.id],
    );
    await app.query(
      "INSERT INTO audit_log (actor_type, actor_session_id, action, details) VALUES ('parent', $1, 'access.denied', '{\"error_id\":\"E-004\"}')",
      [oldSession.id],
    );
    await admin.query("UPDATE intake_drafts SET created_at = $2, expires_at = $3 WHERE id = $1", [oldDraft.id, oldCreated, oldDraftExpiry]);
    await admin.query("UPDATE parent_sessions SET created_at = $2, expires_at = $3 WHERE id = $1", [oldSession.id, oldCreated, oldSessionExpiry]);

    const pinnedSession = await one<{ id: string }>(app, "INSERT INTO parent_sessions DEFAULT VALUES RETURNING id");
    const pinnedDraft = await one<{ id: string }>(app,
      "INSERT INTO intake_drafts (session_id, kind) VALUES ($1, 'missing') RETURNING id", [pinnedSession.id]);
    const reserved = await one<{ id: string }>(app, "SELECT reserve_ai_call($1, 0.010000) AS id", [pinnedDraft.id]);
    await admin.query("UPDATE intake_drafts SET created_at = $2, expires_at = $3 WHERE id = $1", [pinnedDraft.id, oldCreated, oldDraftExpiry]);

    const linkedCase = await insertMissing(app);
    const linkedSession = await one<{ reporter_session_id: string }>(app,
      "SELECT reporter_session_id FROM cases WHERE id = $1", [linkedCase.id]);
    await admin.query("UPDATE parent_sessions SET created_at = $2, expires_at = $3 WHERE id = $1", [linkedSession.reporter_session_id, oldCreated, oldSessionExpiry]);

    const sweep = await app.query("SELECT * FROM sweep_expired_metadata($1)", [now]);
    expect(sweep.rows).toEqual([{ deleted_drafts: 1, deleted_sessions: 1 }]);

    expect((await app.query("SELECT id FROM intake_drafts WHERE id = $1", [oldDraft.id])).rowCount).toBe(0);
    expect((await app.query("SELECT id FROM parent_sessions WHERE id = $1", [oldSession.id])).rowCount).toBe(0);
    expect((await app.query("SELECT id FROM intake_drafts WHERE id = $1", [pinnedDraft.id])).rowCount).toBe(1);
    expect((await app.query("SELECT id FROM ai_reservations WHERE id = $1 AND state = 'reserved' AND draft_id = $2", [reserved.id, pinnedDraft.id])).rowCount).toBe(1);
    expect((await app.query("SELECT id FROM cases WHERE id = $1", [linkedCase.id])).rowCount).toBe(1);
    expect((await app.query("SELECT id FROM parent_sessions WHERE id = $1", [linkedSession.reporter_session_id])).rowCount).toBe(1);

    const retained = await one<{ session_id: string | null }>(app,
      "SELECT actor_session_id AS session_id FROM audit_log WHERE actor_session_id = $1 ORDER BY id DESC LIMIT 1", [oldSession.id]);
    expect(retained).toEqual({ session_id: oldSession.id });
    expect((await app.query("SELECT id FROM ai_calls WHERE reservation_id = $1 AND draft_id IS NULL", [settled.id])).rowCount).toBe(1);
    expect((await app.query("SELECT id FROM ai_reservations WHERE id = $1 AND state = 'settled' AND draft_id IS NULL", [settled.id])).rowCount).toBe(1);
  });
});
