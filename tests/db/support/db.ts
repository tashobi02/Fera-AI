// Synthetic-only helpers for the PostgreSQL 16 integration tests (TASK-062).
// Gated: they run only under `npm run test:db`, which sets FERA_DB_TESTS=1 and a fresh
// per-run FERA_DB_NAME. Setup that needs the owner uses the local superuser; every
// behaviour under test runs as the restricted runtime roles.
import { randomBytes, randomUUID } from "node:crypto";
import { Client, Pool, type ClientBase } from "pg";
import { expect } from "vitest";
// @ts-expect-error -- plain ESM script without type declarations
import { DEFAULT_DATABASE_URL, assertDatabaseName, assertLocalDatabaseUrl, withDatabase } from "../../../scripts/db/guard.mjs";
// @ts-expect-error -- plain ESM script without type declarations
import { rolePasswordEnv } from "../../../scripts/db/roles.mjs";

export const dbTestsEnabled = process.env.FERA_DB_TESTS === "1";

export type DbRole = "admin" | "app" | "redactor";

function roleUrl(role: DbRole): string {
  const admin = assertLocalDatabaseUrl(process.env.FERA_DB_ADMIN_URL ?? DEFAULT_DATABASE_URL) as URL;
  const url = withDatabase(admin, assertDatabaseName(process.env.FERA_DB_NAME)) as URL;
  if (role !== "admin") {
    const passwords = rolePasswordEnv() as Record<string, string>;
    url.username = role === "app" ? "fera_app" : "fera_redactor";
    url.password = role === "app" ? passwords.FERA_APP_DB_PASSWORD : passwords.FERA_REDACTOR_DB_PASSWORD;
  }
  return url.href;
}

export async function connect(role: DbRole): Promise<Client> {
  const client = new Client({ connectionString: roleUrl(role), connectionTimeoutMillis: 10_000 });
  await client.connect();
  return client;
}

export function pool(role: DbRole): Pool {
  return new Pool({ connectionString: roleUrl(role), max: 2, connectionTimeoutMillis: 10_000 });
}

export async function tx<T>(client: ClientBase, fn: () => Promise<T>): Promise<T> {
  await client.query("BEGIN");
  try {
    const result = await fn();
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  }
}

// Effective privileges of the runtime roles on every public table: table-level grants,
// then column-level grants where no table-level grant exists. Golden-tested.
export const PRIVILEGE_MATRIX_SQL = `
  WITH roles(role) AS (VALUES ('fera_app'), ('fera_redactor')),
  tabs AS (SELECT c.oid, c.relname FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r'),
  tp AS (
    SELECT r.role, t.relname, p.priv FROM roles r, tabs t,
      unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p(priv)
    WHERE has_table_privilege(r.role, t.oid, p.priv)),
  cp AS (
    SELECT r.role, t.relname, p.priv, string_agg(a.attname, ',' ORDER BY a.attname) AS cols
    FROM roles r, tabs t JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum > 0 AND NOT a.attisdropped,
      unnest(ARRAY['SELECT','INSERT','UPDATE']) p(priv)
    WHERE has_column_privilege(r.role, t.oid, a.attnum, p.priv) AND NOT has_table_privilege(r.role, t.oid, p.priv)
    GROUP BY 1, 2, 3)
  SELECT role || ' ' || relname || ' ' || string_agg(priv, ',' ORDER BY priv) AS line FROM tp GROUP BY role, relname
  UNION ALL SELECT role || ' ' || relname || ' ' || priv || '(' || cols || ')' FROM cp
  ORDER BY 1`;

// SQLSTATEs: 42501 insufficient_privilege, 23514 check_violation, 23505 unique_violation,
// P0001 plain RAISE EXCEPTION.
export async function expectPgError(work: Promise<unknown>, code: string, message?: RegExp): Promise<void> {
  const err = await work.then(
    () => null,
    (e: unknown) => e as { code?: string; message?: string },
  );
  expect(err, "expected the database to reject this").not.toBeNull();
  expect(err?.code).toBe(code);
  if (message) expect(err?.message).toMatch(message);
}

export async function one<T = Record<string, unknown>>(client: ClientBase, sql: string, params: unknown[] = []): Promise<T> {
  const { rows } = await client.query(sql, params);
  if (rows.length !== 1) throw new Error(`expected one row, got ${rows.length}`);
  return rows[0] as T;
}

// ---- synthetic fixtures -----------------------------------------------------

let phoneSeq = 0;
// Clearly fake numbers in the 01X0000000N shape (SQL: ^01[0-9]{9}$).
export const fakePhone = () => `0170000${String(++phoneSeq).padStart(4, "0")}`;
const hex64 = () => randomBytes(32).toString("hex");
const refSuffix = () => randomBytes(6).toString("hex").slice(0, 6).toUpperCase();
const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();

export const MOCK_DISTRICT = 1;

// Reference rows are owner data, so the superuser seeds them.
export async function seedReference(admin: ClientBase): Promise<void> {
  await admin.query(
    `INSERT INTO districts (code, name_en, name_bn, division_en, lat, lng)
     VALUES ($1, '[MOCK] District 01', '[MOCK] জেলা ০১', '[MOCK] Division', 23.5, 90.4)
     ON CONFLICT DO NOTHING`,
    [MOCK_DISTRICT],
  );
}

export interface Actors {
  staff: string;
  officer: string;
  unverifiedOfficer: string;
  admin: string;
}

// Accounts are seeded by the owner (fera_app has no INSERT on users).
export async function createActors(owner: ClientBase): Promise<Actors> {
  const tag = randomBytes(3).toString("hex");
  const insert = async (name: string, role: string, verified: boolean) =>
    (
      await one<{ id: string }>(
        owner,
        `INSERT INTO users (username, display_name, password_hash, role, verified, district_code)
         VALUES ($1, $2, 'synthetic-not-a-hash', $3, $4, $5) RETURNING id`,
        [`${name}.${tag}`, `[MOCK] ${name}`, role, verified, MOCK_DISTRICT],
      )
    ).id;
  return {
    staff: await insert("staff", "staff", false),
    officer: await insert("officer", "officer", true),
    unverifiedOfficer: await insert("pending-officer", "officer", false),
    admin: await insert("admin", "admin", false),
  };
}

export interface CaseRef {
  id: string;
  ref: string;
  name: string;
  phone: string;
}

export async function insertMissing(app: ClientBase, opts: { status?: string } = {}): Promise<CaseRef> {
  const session = await one<{ id: string }>(app, "INSERT INTO parent_sessions DEFAULT VALUES RETURNING id");
  const ref = `M-${refSuffix()}`;
  const name = `Synthetic Child ${ref}`;
  const phone = fakePhone();
  const at = daysAgo(1);
  const row = await one<{ id: string }>(
    app,
    `INSERT INTO cases (ref_code, kind, status, source, reporter_session_id, client_submission_id,
       submission_payload_hash, input_hash, raw_text, child_name, child_name_latin, age_years, age_min, age_max,
       sex, height_cm, clothing, marks, circumstances, event_at, event_at_lower, event_at_upper,
       place_text, district_code, thana, reporter_relation, contact_phone, gd_number,
       provenance, embedding, embedding_model, embedding_revision, embedding_space)
     VALUES ($1, 'missing', $2, 'parent', $3, $4, $5, $6, $7, $8, $9, 7, 7, 7,
       'female', 120, $10, $11, $12, $13, $13, $13,
       $14, $15, '[MOCK] Thana', 'mother', $16, $17,
       $18, $19, 'multilingual-e5-small', 'synthetic-rev', 'synthetic-space')
     RETURNING id`,
    [
      ref, opts.status ?? "submitted", session.id, randomUUID(), hex64(), hex64(),
      `[MOCK] raw text for ${ref}`, name, `Synthetic Latin ${ref}`,
      `[MOCK] clothing ${ref}`, `[MOCK] marks ${ref}`, `[MOCK] circumstances ${ref}`, at,
      `[MOCK] place ${ref}`, MOCK_DISTRICT, phone, `GD-${ref}`,
      JSON.stringify({ "child.name": { quote: name, start_utf16: 0, end_utf16: name.length, derivation: "direct" } }),
      `[${Array(384).fill(0.01).join(",")}]`,
    ],
  );
  return { id: row.id, ref, name, phone };
}

export async function insertFound(app: ClientBase, staffId: string): Promise<CaseRef> {
  const ref = `F-${refSuffix()}`;
  const name = `Synthetic Found ${ref}`;
  const phone = fakePhone();
  const at = daysAgo(1);
  const row = await one<{ id: string }>(
    app,
    `INSERT INTO cases (ref_code, kind, status, source, created_by_user_id, client_submission_id,
       submission_payload_hash, child_name, age_min, age_max, sex, clothing, circumstances,
       event_at, event_at_lower, event_at_upper, place_text, district_code, contact_phone)
     VALUES ($1, 'found', 'open', 'staff', $2, $3, $4, $5, 6, 9, 'female', $6, $7, $8, $8, $8, $9, $10, $11)
     RETURNING id`,
    [ref, staffId, randomUUID(), hex64(), name, `[MOCK] clothing ${ref}`, `[MOCK] found description ${ref}`, at,
      `[MOCK] found place ${ref}`, MOCK_DISTRICT, phone],
  );
  return { id: row.id, ref, name, phone };
}

export async function openMissing(app: ClientBase, id: string): Promise<void> {
  await app.query("UPDATE cases SET status = 'open' WHERE id = $1", [id]);
}

// Inserts a pending candidate on both current versions and moves open endpoints to
// matched_pending_review in the same transaction.
export async function addCandidate(app: ClientBase, missingId: string, foundId: string, rank = 1): Promise<string> {
  return tx(app, async () => {
    const c = await one<{ id: string }>(
      app,
      `INSERT INTO match_candidates (missing_case_id, found_case_id, missing_version, found_version,
         score, rank, reason_bn, reason_en, components)
       SELECT m.id, f.id, m.version, f.version, 72.5, $3, '[MOCK] কারণ', '[MOCK] similar clothing and district',
         '{"text": 0.7, "age": 1}'
       FROM cases m, cases f WHERE m.id = $1 AND f.id = $2 RETURNING id`,
      [missingId, foundId, rank],
    );
    await app.query(
      "UPDATE cases SET status = 'matched_pending_review' WHERE id = ANY($1) AND status = 'open'",
      [[missingId, foundId]],
    );
    return c.id;
  });
}

export interface ConfirmInput {
  candidateId: string;
  missingId: string;
  foundId: string;
  officerId: string;
  voidCandidates?: string[];
  reopenCases?: string[];
  withAudit?: boolean;
  withReferral?: boolean;
}

// The API-010 write set in one transaction (TASK-015 owns the real service).
export async function confirmPair(app: ClientBase, input: ConfirmInput): Promise<void> {
  const { candidateId: c, missingId: m, foundId: f, officerId: o } = input;
  await tx(app, async () => {
    if (input.voidCandidates?.length) {
      await app.query("UPDATE match_candidates SET status = 'voided', decided_at = now() WHERE id = ANY($1)", [input.voidCandidates]);
    }
    await app.query("UPDATE match_candidates SET status = 'confirmed', decided_at = now() WHERE id = $1", [c]);
    await app.query("INSERT INTO review_decisions (candidate_id, officer_id, decision) VALUES ($1, $2, 'confirm')", [c, o]);
    if (input.withAudit ?? true) {
      await app.query(
        `INSERT INTO audit_log (actor_type, actor_user_id, action, case_id, candidate_id, details)
         VALUES ('officer', $1, 'match.confirm', $2, $3, '{"api":"API-010"}')`,
        [o, m, c],
      );
    }
    if (input.withReferral ?? true) {
      await app.query(
        "INSERT INTO referrals (candidate_id, found_case_id, missing_case_id, referred_by, note) VALUES ($1, $2, $3, $4, $5)",
        [c, f, m, o, "[MOCK] referral note"],
      );
    }
    await app.query("UPDATE cases SET status = 'confirmed' WHERE id = $1", [m]);
    await app.query("UPDATE cases SET status = 'referred', closed_at = now() WHERE id = $1", [f]);
    if (input.reopenCases?.length) {
      await app.query("UPDATE cases SET status = 'open' WHERE id = ANY($1) AND status = 'matched_pending_review'", [input.reopenCases]);
    }
  });
}

export async function closeMissing(app: ClientBase, id: string, outcome = "coordination_recorded"): Promise<void> {
  await app.query(
    "UPDATE cases SET status = 'closed', outcome = $2, outcome_note = '[MOCK] synthetic closure note', closed_at = now() WHERE id = $1",
    [id, outcome],
  );
}

// A complete synthetic pair: missing closed (coordination recorded), found referred.
export async function closedPair(app: ClientBase, actors: Actors): Promise<{ missing: CaseRef; found: CaseRef; candidateId: string }> {
  const missing = await insertMissing(app);
  await openMissing(app, missing.id);
  const found = await insertFound(app, actors.staff);
  const candidateId = await addCandidate(app, missing.id, found.id);
  await confirmPair(app, { candidateId, missingId: missing.id, foundId: found.id, officerId: actors.officer });
  await closeMissing(app, missing.id);
  return { missing, found, candidateId };
}
