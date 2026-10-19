// P3-014 / P3-205 / P3-206 / P3-207 — shared E2E fixtures.
//
// Seeds a complete synthetic actor set: 1 staff user, 1 unverified officer,
// 1 verified officer, 1 parent session, 1 missing case in `open` state and
// 1 found case in `open` state, linked by a pending `match_candidate`.  The
// webServer has just run `db:reset`, so the schema and roles are in place
// and the database is empty.  Every seed is wrapped in a single
// transaction; any failure rolls back so the spec starts clean.
//
// Why the OWNER role: the runtime role `fera_app` has DML on `cases`,
// `parent_sessions` and `match_candidates`, but no INSERT on `users`
// (the verifier can sign a session but cannot create one).  Inserting
// `users` rows with a known argon2 hash needs superuser; the same OWNER
// pool is used by `tests/db/*.test.ts`.
//
// Why everything is exported as a function instead of a `test.beforeAll`:
// each spec decides when the data is needed.  `safeguarding.spec.ts` and
// the new P3-205/206 specs all call `seedActors()` and share the seeded
// data within a single webServer boot.  `seedActors()` is idempotent in
// the sense that running it twice yields two independent actor sets
// (UUID-keyed); specs that need isolation should call once in a
// `beforeAll` and reuse the result.
import { randomBytes, randomUUID } from "node:crypto";
import type { Client } from "pg";
import {
  DEFAULT_DATABASE_URL,
  assertLocalDatabaseUrl,
  // @ts-expect-error -- the shared database guard is an untyped .mjs module.
} from "../../../scripts/db/guard.mjs";
import { e2eDatabaseUrl } from "./db";

export const DESK_PASSWORD = "fera-e2e-desk-pass";
export const STAFF_DISPLAY = "[MOCK] Browser Staff One";
export const UNVERIFIED_DISPLAY = "[MOCK] Browser Officer Pending";
export const VERIFIED_DISPLAY = "[MOCK] Browser Officer Verified";
export const SEED_PARENT_NAME = "[MOCK] Browser Reporter One";
export const SEED_CHILD_NAME = "[MOCK] Browser Child One";
export const SEED_PHONE_PARENT = "01700000101";
export const SEED_PHONE_FOUND = "01700000102";

export type Actors = {
  staffUserId: string;
  staffUsername: string;
  staffPassword: string;
  unverifiedOfficerId: string;
  unverifiedUsername: string;
  verifiedOfficerId: string;
  verifiedUsername: string;
  parentSessionId: string;
  missingCaseId: string;
  missingRefCode: string;
  foundCaseId: string;
  foundRefCode: string;
  candidateId: string;
};

/** Open a pg connection as the local OWNER role for fixture writes. */
export async function ownerClient(): Promise<Client> {
  const { Client } = await import("pg");
  const url = e2eDatabaseUrl();
  const adminRaw = process.env.FERA_DB_ADMIN_URL ?? DEFAULT_DATABASE_URL;
  assertLocalDatabaseUrl(adminRaw, "test:e2e owner");
  const admin = new URL(adminRaw);
  admin.pathname = `/${url.pathname.slice(1)}`;
  const client = new Client({ connectionString: admin.href, connectionTimeoutMillis: 10_000 });
  await client.connect();
  return client;
}

/** Open a pg connection as the runtime `fera_app` role. Used by specs that
 *  need to read what the app sees.  Mirrors the test process pool. */
export async function appClient(): Promise<Client> {
  const { Client } = await import("pg");
  const url = e2eDatabaseUrl();
  const appUrl = new URL(url.href);
  appUrl.username = "fera_app";
  appUrl.password = process.env.FERA_APP_DB_PASSWORD ?? "fera_app_local_dev";
  const client = new Client({ connectionString: appUrl.href, connectionTimeoutMillis: 10_000 });
  await client.connect();
  return client;
}

export async function seedReferenceDistrict(admin: Client): Promise<void> {
  // Real reference fixture, never child coordinates. The form exposes all districts.
  const { default: reference } = await import("../../../data/districts.json", { with: { type: "json" } });
  for (const d of reference.districts) {
    await admin.query(`INSERT INTO districts(code,name_en,name_bn,division_en,lat,lng) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`,[d.code,d.name_en,d.name_bn,d.division_en,d.lat,d.lng]);
  }
}

async function hashDeskPassword(): Promise<string> {
  const { hash } = await import("@node-rs/argon2");
  // Same params the verifier accepts (src/server/auth/password.ts).
  const ARGON2_PARAMS = { memoryCost: 19_456, timeCost: 2, parallelism: 1, outputLen: 32 } as const;
  return hash(DESK_PASSWORD, ARGON2_PARAMS);
}

/**
 * Seed the full actor set.  Returns the primary keys the specs assert on.
 * Idempotent per run only — the random UUIDs and 6-hex refs differ each call.
 */
export async function seedActors(): Promise<Actors> {
  const admin = await ownerClient();
  try {
    await seedReferenceDistrict(admin);
    const passwordHash = await hashDeskPassword();
    await admin.query("BEGIN");
    try {
      const staffUserId = randomUUID();
      const unverifiedOfficerId = randomUUID();
      const verifiedOfficerId = randomUUID();
      const staffUsername = `staff.e2e.${staffUserId.slice(0, 8)}`;
      const unverifiedUsername = `officer.pending.e2e.${unverifiedOfficerId.slice(0, 8)}`;
      const verifiedUsername = `officer.verified.e2e.${verifiedOfficerId.slice(0, 8)}`;
      for (const row of [
        { id: staffUserId, role: "staff", display: STAFF_DISPLAY, verified: false, username: staffUsername },
        { id: unverifiedOfficerId, role: "officer", display: UNVERIFIED_DISPLAY, verified: false, username: unverifiedUsername },
        { id: verifiedOfficerId, role: "officer", display: VERIFIED_DISPLAY, verified: true, username: verifiedUsername },
      ]) {
        await admin.query(
          `INSERT INTO users (id, username, display_name, password_hash, role, verified, is_active, district_code)
           VALUES ($1, $2, $3, $4, $5::user_role, $6, true, 1)`,
          [row.id, row.username, row.display, passwordHash, row.role, row.verified],
        );
      }

      const parentSessionId = randomUUID();
      await admin.query(`INSERT INTO parent_sessions (id) VALUES ($1)`, [parentSessionId]);

      const missingCaseId = randomUUID();
      const missingSubmissionId = randomUUID();
      const missingHash = randomBytes(32).toString("hex");
      const missingRefCode = `M-${randomBytes(3).toString("hex").slice(0, 6).toUpperCase()}`;
      await admin.query(
        `INSERT INTO cases (id, ref_code, kind, status, source, is_synthetic, reporter_session_id,
                            client_submission_id, submission_payload_hash, raw_text, child_name,
                            age_years, age_min, age_max, sex, clothing, circumstances,
                            event_at, event_at_lower, event_at_upper, place_text, district_code,
                            contact_phone, reporter_relation, provenance)
         VALUES ($1, $2, 'missing', 'submitted', 'parent', true, $3, $4, $5, $6, $7,
                 8, 8, 8, 'female', $8, $9, now(), now(), now(), $10, 1,
                 $11, 'mother', '{}'::jsonb)`,
        [
          missingCaseId, missingRefCode, parentSessionId, missingSubmissionId, missingHash,
          `${SEED_PARENT_NAME} raw text`, SEED_CHILD_NAME,
          "[MOCK] clothing", "[MOCK] circumstances",
          "[MOCK] place", SEED_PHONE_PARENT,
        ],
      );
      // Open the case (state machine: submitted → open).
      await admin.query("UPDATE cases SET status = 'open' WHERE id = $1", [missingCaseId]);

      const foundCaseId = randomUUID();
      const foundSubmissionId = randomUUID();
      const foundHash = randomBytes(32).toString("hex");
      const foundRefCode = `F-${randomBytes(3).toString("hex").slice(0, 6).toUpperCase()}`;
      await admin.query(
        `INSERT INTO cases (id, ref_code, kind, status, source, is_synthetic, created_by_user_id,
                            client_submission_id, submission_payload_hash, raw_text, child_name,
                            age_min, age_max, sex, clothing, circumstances,
                            event_at, event_at_lower, event_at_upper, place_text, district_code,
                            contact_phone, provenance)
         VALUES ($1, $2, 'found', 'open', 'staff', true, $3, $4, $5, $6, $7,
                 7, 9, 'female', $8, $9, now(), now(), now(), $10, 1,
                 $11, '{}'::jsonb)`,
        [
          foundCaseId, foundRefCode, verifiedOfficerId, foundSubmissionId, foundHash,
          `${SEED_PARENT_NAME} found raw text`, SEED_CHILD_NAME,
          "[MOCK] found clothing", "[MOCK] found circumstances",
          "[MOCK] found place", SEED_PHONE_FOUND,
        ],
      );

      const candidateId = randomUUID();
      await admin.query(
        `INSERT INTO match_candidates (id, missing_case_id, found_case_id, missing_version, found_version,
                                       score, rank, reason_bn, reason_en, components, status)
         VALUES ($1, $2, $3, 1, 1, 72.5, 1, $4, $5, $6::jsonb, 'pending')`,
        [
          candidateId, missingCaseId, foundCaseId,
          "[MOCK] কারণ", "[MOCK] reason",
          JSON.stringify({ cosine: 0.7, name: null, clothing: null, district: null, age: 1 }),
        ],
      );
      // Move both endpoints to matched_pending_review (allowed: open → that).
      await admin.query(
        `UPDATE cases SET status = 'matched_pending_review' WHERE id = ANY($1) AND status = 'open'`,
        [[missingCaseId, foundCaseId]],
      );

      await admin.query("COMMIT");
      return {
        staffUserId,
        staffUsername,
        staffPassword: DESK_PASSWORD,
        unverifiedOfficerId,
        unverifiedUsername,
        verifiedOfficerId,
        verifiedUsername,
        parentSessionId,
        missingCaseId,
        missingRefCode,
        foundCaseId,
        foundRefCode,
        candidateId,
      };
    } catch (err) {
      await admin.query("ROLLBACK").catch(() => undefined);
      throw err;
    }
  } finally {
    await admin.end();
  }
}

/** Build a fresh `APIRequestContext` whose every request carries the same-origin
 *  `Origin` header. The server's same-origin check (src/app/api/_shared/request.ts)
 *  falls back to `Origin` vs `Host` when `sec-fetch-site` is absent, which is the
 *  case for direct APIRequestContext calls (the browser context is the only
 *  caller that sets `sec-fetch-site`). Without this header, every state-changing
 *  request (POST/PUT/PATCH/DELETE) is refused with E-003 "origin". */
export async function deskContext(
  baseURL: string,
  origin: string,
): Promise<import("@playwright/test").APIRequestContext> {
  const { request: factory } = await import("@playwright/test");
  return factory.newContext({ baseURL, extraHTTPHeaders: { origin } });
}

/** Sign in as a desk user; the cookie is set on the APIRequestContext for
 *  subsequent calls. The `origin` is also sent as the Origin header on the
 *  sign-in itself so the route's same-origin check passes (the sign-in path is
 *  exempt from the coarse check, but we keep the behaviour identical for
 *  fixtures callers). */
export async function signInDesk(
  req: import("@playwright/test").APIRequestContext,
  username: string,
  password: string,
  origin: string,
): Promise<void> {
  const res = await req.post("/api/auth/sign-in", {
    data: { username, password },
    headers: { origin },
  });
  if (res.status() !== 200) {
    throw new Error(`sign-in for ${username} returned ${res.status()}: ${await res.text()}`);
  }
}
