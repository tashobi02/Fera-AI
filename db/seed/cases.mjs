// Synthetic case loader (TASK-019; A-039, BR-026, FR-032, OD-010-4). Loads the 200 opaque
// submission drafts of data/synthetic/records.jsonl as cases, SYNTHETIC ONLY.
//
// Why this is a seed-only path and not src/server/case/commands.ts: the case service is
// TypeScript behind "@/" aliases, runs on its own fera_app pool, and mints the case id and
// reference code itself. This plain-ESM script runs with the owner connection that
// `npm run seed` already holds. So it mirrors createMissingCase/createFoundCase + openCase
// column for column and audit row for audit row (docs/execution/evidence/seed-cases.md):
//   - missing: one anonymous parent_sessions row per report (id = record_id, revoked at
//     creation so no cookie can use it), source 'parent', stored `submitted`, then stepped
//     to `open` as the route does after embedding (matching_state stays 'queued').
//     Audit: case.created (actor parent) + case.state_changed submitted->open (actor system).
//   - found: owned by staff.demo or staff2.demo (from `npm run seed:users`), picked by the
//     last hex digit of record_id so demo and full agree. Stored `open`. Audit: case.created
//     (actor staff).
//   - client_submission_id = record_id, so a re-run finds the case and inserts nothing; the
//     payload hash is the contracts' canonical hash (a test compares them), so an existing
//     row with another hash is a conflict, never a second report.
//   - embedding and embedding_* stay NULL (a later task embeds). case id and ref_code are
//     DB/random as in the service. Audit details use the service's strict key set and carry
//     no child payload. The id map (record_id -> case id) is not printed: record_id is the
//     case's client_submission_id column, which is the join key.
// Everything runs in one transaction: a failure leaves nothing behind.
import { createHash, randomInt } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const REF_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const REF_ATTEMPTS = 5;
const REQUEST_ID = "seed-cases";
// Arbitrary fixed key for this loader.
const SEED_LOCK_KEY = 190019;
const STAFF_USERNAMES = ["staff.demo", "staff2.demo"];

// demo_role values loaded by --set demo. Rafi is live-created by voice in the demo
// (OD-010-4) and is withheld; every other record carries no demo_role.
export const DEMO_ROLES = ["kamalapur_boy", "narayanganj_decoy", "mim", "mim_public_post", "sabbir"];

// Same canonical JSON and hash as src/contracts/server/submission.ts (district_text dropped).
function canonicalJson(value) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("non-finite number is not canonical JSON");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
  }
  throw new Error(`${typeof value} is not canonical JSON`);
}
// The committed drafts differ from the schemas' parsed output in one way: the contracts drop a
// ".000" fraction from event times (src/contracts/primitives.ts). Apply it here so the stored
// values and the hash equal what the case service would store (a test checks the hash).
const DROP_ZERO_FRACTION = /\.000(?=[+-]\d\d:\d\d$)/;
function parsedDraft(draft) {
  const event = { ...draft.event };
  for (const key of ["at", "at_lower", "at_upper"]) {
    if (typeof event[key] === "string") event[key] = event[key].replace(DROP_ZERO_FRACTION, "");
  }
  return { ...draft, event };
}
function payloadHash(draft) {
  const event = Object.fromEntries(Object.entries(draft.event).filter(([k]) => k !== "district_text"));
  return createHash("sha256").update(canonicalJson({ ...draft, event }), "utf8").digest("hex");
}

export function loadSyntheticSet(set) {
  if (set !== "demo" && set !== "full") throw new Error("set must be demo or full");
  const records = readFileSync(join(ROOT, "data/synthetic/records.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  if (set === "full") return records;
  const truth = JSON.parse(readFileSync(join(ROOT, "data/synthetic/ground_truth.json"), "utf8"));
  const keep = new Set(truth.records.filter((r) => DEMO_ROLES.includes(r.demo_role)).map((r) => r.record_id));
  const chosen = records.filter((r) => keep.has(r.record_id));
  // A regenerated set that lost or doubled a demo role must not silently load a partial demo.
  const roleCounts = DEMO_ROLES.map((role) => truth.records.filter((t) => t.demo_role === role && chosen.some((c) => c.record_id === t.record_id)).length);
  if (chosen.length !== DEMO_ROLES.length || roleCounts.some((n) => n !== 1)) {
    throw new Error("the demo set is incomplete: every demo_role in DEMO_ROLES must match exactly one record");
  }
  return chosen;
}

function newRefCode(kind) {
  let suffix = "";
  for (let i = 0; i < 6; i++) suffix += REF_ALPHABET[randomInt(REF_ALPHABET.length)];
  return `${kind === "missing" ? "M-" : "F-"}${suffix}`;
}

// Fictional block 0120000NNNN (OD-010-6). A record outside it could carry a real number: refuse.
const SYNTHETIC_PHONE = /^0120000\d{4}$/;
export function assertSynthetic(rec) {
  if (rec.is_synthetic !== true) throw new Error("refusing a record that is not marked synthetic");
  if (typeof rec.draft?.reporter?.phone !== "string" || !SYNTHETIC_PHONE.test(rec.draft.reporter.phone)) {
    throw new Error("refusing a record whose phone is outside the synthetic block");
  }
}

function insertSql(scopeColumn) {
  return `INSERT INTO cases (ref_code, kind, status, source, is_synthetic, ${scopeColumn}, client_submission_id,
      submission_payload_hash, raw_text, child_name, child_name_latin, age_years, age_min, age_max, sex,
      height_cm, clothing, marks, circumstances, event_at, event_at_approx, event_at_lower, event_at_upper,
      place_text, district_code, thana, reporter_relation, contact_phone, provenance)
    VALUES ($1, $2, $3, $4, true, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18,
      $19, $20, $21, $22, $23, $24, $25, $26, $27, $28::jsonb)
    RETURNING id, ref_code, version`;
}

async function insertCase(client, rec, owner, hash) {
  const d = rec.draft;
  const missing = rec.kind === "missing";
  for (let attempt = 1; attempt <= REF_ATTEMPTS; attempt++) {
    const ref = newRefCode(rec.kind);
    await client.query("SAVEPOINT seed_case");
    try {
      const { rows } = await client.query(insertSql(missing ? "reporter_session_id" : "created_by_user_id"), [
        ref, rec.kind, missing ? "submitted" : "open", missing ? "parent" : "staff", owner, rec.record_id, hash,
        d.source_text === "" ? null : d.source_text, d.child.name, d.child.name_latin, d.child.age_years, d.child.age_min,
        d.child.age_max, d.child.sex, d.child.height_cm, d.child.clothing, d.child.marks, d.event.circumstances,
        d.event.at, d.event.at_approx, d.event.at_lower, d.event.at_upper, d.event.place_text, d.event.district_code,
        d.event.thana, d.reporter.relation, d.reporter.phone, JSON.stringify(d.evidence),
      ]);
      await client.query("RELEASE SAVEPOINT seed_case");
      return rows[0];
    } catch (err) {
      await client.query("ROLLBACK TO SAVEPOINT seed_case");
      if (err?.code === "23505" && err?.constraint === "cases_ref_code_key" && attempt < REF_ATTEMPTS) continue;
      throw err;
    }
  }
  throw new Error("reference code attempts exhausted");
}

async function audit(client, { type, userId = null, sessionId = null, action, caseId, details }) {
  await client.query(
    `INSERT INTO audit_log (actor_type, actor_user_id, actor_session_id, action, case_id, details, request_id)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
    [type, userId, sessionId, action, caseId, JSON.stringify(details), REQUEST_ID],
  );
}

// Returns { inserted, skipped }. Throws before writing anything if the staff accounts are missing.
export async function seedCases(client, { set }) {
  const records = loadSyntheticSet(set);
  const staff = await client.query("SELECT id, username FROM users WHERE username = ANY($1::text[]) AND role = 'staff' AND is_active", [STAFF_USERNAMES]);
  const staffIds = STAFF_USERNAMES.map((u) => staff.rows.find((r) => r.username === u)?.id);
  if (staffIds.some((id) => !id)) throw new Error("staff accounts staff.demo and staff2.demo are missing; run npm run seed:users first");

  let inserted = 0;
  let skipped = 0;
  await client.query("BEGIN");
  try {
    // Serialise concurrent seed runs (two `npm run seed` at once): the second waits, then skips.
    await client.query("SELECT pg_advisory_xact_lock($1)", [SEED_LOCK_KEY]);
    for (const rec of records) {
      assertSynthetic(rec);
      const record = { ...rec, draft: parsedDraft(rec.draft) };
      const hash = payloadHash(record.draft);
      const existing = await client.query("SELECT submission_payload_hash FROM cases WHERE client_submission_id = $1", [rec.record_id]);
      if (existing.rows.length > 0) {
        if (existing.rows[0].submission_payload_hash !== hash) throw new Error("a seeded case differs from the committed record; reset the database");
        skipped++;
        continue;
      }
      if (rec.kind === "missing") {
        // DO UPDATE, not DO NOTHING: a live session that happens to carry this id is revoked, never silently reused.
        await client.query("INSERT INTO parent_sessions (id, revoked_at) VALUES ($1, now()) ON CONFLICT (id) DO UPDATE SET revoked_at = COALESCE(parent_sessions.revoked_at, now())", [rec.record_id]);
        const row = await insertCase(client, record, rec.record_id, hash);
        await audit(client, { type: "parent", sessionId: rec.record_id, action: "case.created", caseId: row.id,
          details: { ref_code: row.ref_code, version: row.version, to_status: "submitted", api: "API-003", replayed: false } });
        // D2A seed rule: load missing reports as submitted, then open them. No FOR UPDATE: the row is
        // uncommitted, so no other transaction can see it (and the advisory lock serialises runs).
        await client.query("UPDATE cases SET status = 'open' WHERE id = $1", [row.id]);
        await audit(client, { type: "system", action: "case.state_changed", caseId: row.id,
          details: { ref_code: row.ref_code, version: row.version, from_status: "submitted", to_status: "open", api: "API-003" } });
      } else {
        const userId = staffIds[parseInt(rec.record_id.slice(-1), 16) % 2];
        const row = await insertCase(client, record, userId, hash);
        await audit(client, { type: "staff", userId, action: "case.created", caseId: row.id,
          details: { ref_code: row.ref_code, version: row.version, to_status: "open", api: "API-007", replayed: false } });
      }
      inserted++;
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  }
  return { inserted, skipped };
}
