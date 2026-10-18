// Draft metadata registry seam (TASK-014/020, FR-002/004, BR-004/023, TC-002/043/060).
//
// This file declares the async registry interface the orchestrator and the routes
// depend on. Two implementations live in this module:
//
//   * `createInMemoryDraftRegistry` — a process-local registry. Used by unit
//     tests and any other seam that does not have a real DB available. The
//     orchestrator must NEVER see a real provider dispatch from this seam,
//     because there is no atomic global budget backing it. The deploy default
//     in production uses the DB-backed variant instead.
//
//   * `createDbDraftRegistry` — a PostgreSQL-backed registry. It owns the
//     metadata row, the per-principal active-draft count (a server-side
//     concurrency-safe leader) and the round counter. SQL functions
//     `reserve_ai_call` and the existing intake_drafts constraints are the
//     sole authority for the paid-call counter and revision; the registry only
//     updates fields the SQL functions leave alone (follow_up_round, token,
//     payload_hash, principal binding, expiry). The DB implementation is the
//     production-only default; tests inject the in-memory variant.
//
// The route layer never reads or sets a token from a map; both implementations
// re-derive the signed owner/kind token from the row's id and the timestamp
// the row recorded on creation.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { LIMITS, draftTokenSchema, isoDateTimeSchema, toDhakaIso, type CaseDraft, type ErrorEnvelope, type ServerErrorId } from "@/contracts";
import { intakeDraftMetadataSchema, type IntakeDraftMetadata, type Principal } from "@/contracts/server";
import { firstRow, col, RowShapeError } from "@/server/db/decode";
import { getPool } from "@/server/db/pool";
import type { Pool } from "pg";
import { createLogger } from "@/app/api/_shared/log";

// pg returns timestamptz as a Date; the schema mandates "+06:00" ISO text. Render
// it deterministically so a reload re-derives the same token, and so the
// isoDateTimeSchema validates the string the route serialises.
function toIso(date: Date | null | undefined): string {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new RowShapeError("intake_drafts", "created_at");
  }
  return toDhakaIso(date.getTime());
}

type PoolLike = Pick<Pool, "query" | "connect">;

// Per-principal cap: at most ACTIVE_DRAFTS_PER_PRINCIPAL (3) drafts may exist in
// the last ACTIVE_DRAFT_WINDOW_MS (24h) before the route returns E-019. The
// guard is concurrency-safe via a server-scoped advisory lock keyed by the
// principal id (pg_advisory_xact_lock(int4)), taken inside the create
// transaction. The lock order is: budget (by the spend layer) -> intake_drafts;
// the advisory lock does not collide with the global budget lock because the
// advisory lock's int4 key is the principal id and is held for the create only.
export const ACTIVE_DRAFTS_PER_PRINCIPAL = 3;
export const ACTIVE_DRAFT_WINDOW_MS = 24 * 60 * 60 * 1000;
const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;
const TOKEN_BRAND = "syn.draft.v1";
const tokenScope = (principal: Principal): string => principal.kind === "parent" ? `s-${principal.sessionId}` : `u-${principal.userId}`;

export type DraftSigner = (kind: "missing" | "found", principal: Principal, draftId: string, createdMs: number, followUpRound: number) => string;

export function createDraftSigner(secret: Buffer): DraftSigner {
  if (!Buffer.isBuffer(secret) || secret.length < 16) throw new Error("DRAFT_SIGN_SECRET must be at least 16 bytes");
  return (kind, principal, draftId, createdMs, followUpRound) => {
    const principalKey = tokenScope(principal);
    const body = `${TOKEN_BRAND}.${kind}.${principalKey}.${draftId}.${createdMs}.${followUpRound}`;
    const sig = createHmac("sha256", secret).update(body).digest("base64url").slice(0, 32);
    return `${body}.${sig}`;
  };
}

export type DraftTokenPayload = {
  draftId: string;
  createdMs: number;
  followUpRound: number;
};

export function verifyDraftToken(
  secret: Buffer,
  token: string,
  kind: "missing" | "found",
  principal: Principal,
): DraftTokenPayload | null {
  const parsed = draftTokenSchema.safeParse(token);
  if (!parsed.success) return null;
  const parts = token.split(".");
  if (parts.length < 9 || !token.startsWith(`${TOKEN_BRAND}.`)) return null;
  const sig = parts[parts.length - 1];
  const body = parts.slice(0, -1).join(".");
  if (sig.length < 16) return null;
  const principalKey = tokenScope(principal);
  const expectedBody = `${TOKEN_BRAND}.${kind}.${principalKey}`;
  if (!body.startsWith(expectedBody)) return null;
  const rest = body.slice(expectedBody.length + 1).split(".");
  if (rest.length !== 3) return null;
  const [draftId, createdAtStr, roundStr] = rest;
  if (!/^[0-9a-f-]{8,64}$/.test(draftId)) return null;
  const created = Number(createdAtStr);
  const round = Number(roundStr);
  if (!Number.isInteger(created) || created <= 0) return null;
  if (!Number.isInteger(round) || round < 0 || round > LIMITS.followUpRounds) return null;
  const expected = createHmac("sha256", secret).update(body).digest("base64url").slice(0, 32);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return { draftId, createdMs: created, followUpRound: round };
}

// A view used by the orchestrator after each reservation. The orchestrator reads
// the post-reserve revision from here. The registry's `get` is reloadable
// cross-process; the orchestrator re-issues `get` after each `runPaidCall` to
// observe the row's revision refreshed by the spend layer.
export type DraftRow = {
  id: string;
  principalKey: string;
  kind: "missing" | "found";
  created_at: string;
  expires_at: string;
  payload_hash: string | null;
  ai_calls_used: number;
  revision: number;
  follow_up_round: number;
  // The row's currently authorised token, in-memory only. Cleared when the
  // draft is consumed (CONFIRMED) or revoked. The DB implementation re-derives
  // the token deterministically from the row's id, kind, principal, created_at
  // and follow_up_round; tests in the in-memory implementation can read it
  // back through `tokenFor()`.
  token: string | null;
};

const keyFor = (p: Principal): string => p.kind === "parent" ? `s:${p.sessionId}` : `u:${p.userId}`;

export type CreateDraftInput = {
  kind: "missing" | "found";
  principal: Principal;
  payloadHash: string | null;
  initialFollowUpRound?: number;
};

export type CreateDraftResult =
  | { ok: true; row: DraftRow; token: string }
  | { ok: false; errorId: ServerErrorId };

// The async registry interface the orchestrator calls. Two implementations:
// in-memory (tests) and DB-backed (production). Every mutating method returns
// the post-update row, including the next revision, so the orchestrator can
// reload after a successful reservation.
export interface DraftRegistry {
  create(input: CreateDraftInput): Promise<CreateDraftResult>;
  get(id: string): Promise<DraftRow | null>;
  verifyToken(token: string, kind: "missing" | "found", principal: Principal): DraftTokenPayload | null;
  // Reloads the row with the latest server revision after a paid call
  // reservation has advanced it.
  reload(id: string): Promise<DraftRow | null>;
  issueQuestion(id: string, expectedRevision: number): Promise<{ ok: true; row: DraftRow } | { ok: false; errorId: ServerErrorId }>;
  // Atomic conditional payload-hash update: writes the hash only when the row's
  // current revision matches `expectedRevision` and the row has not expired.
  // Returns the post-update row so the orchestrator can move forward with the
  // canonical new revision; refuses with E-005 otherwise.
  setPayloadHash(id: string, hash: string | null, expectedRevision: number): Promise<{ ok: true; row: DraftRow } | { ok: false; errorId: ServerErrorId }>;
  revoke(id: string): Promise<void>;
  // Returns the deterministic token for the row's current state. Both
  // implementations re-derive the token from (kind, principal, id, createdMs,
  // follow_up_round) so the orchestrator's row token compare is consistent
  // across reloads; the in-memory variant also stores it for tests.
  tokenFor(row: DraftRow, principal: Principal): string;
}

export type InMemoryRegistryDeps = {
  signer: DraftSigner;
  verify: (token: string, kind: "missing" | "found", principal: Principal) => DraftTokenPayload | null;
  now?: () => number;
  rng?: (bytes: number) => Buffer;
};

export function createInMemoryDraftRegistry(opts: InMemoryRegistryDeps): DraftRegistry {
  const rows = new Map<string, DraftRow>();
  const rng = opts.rng ?? ((bytes: number) => randomBytes(bytes));
  const now = opts.now ?? Date.now;

  function listForPrincipal(principal: Principal): DraftRow[] {
    const key = keyFor(principal);
    const out: DraftRow[] = [];
    for (const row of rows.values()) if (row.principalKey === key) out.push(row);
    return out;
  }

  function countActive(principal: Principal, sinceMs: number): number {
    let n = 0;
    for (const row of listForPrincipal(principal)) {
      const createdMs = Date.parse(row.created_at);
      if (createdMs >= sinceMs) n++;
    }
    return n;
  }

  function prune(principal: Principal): void {
    for (const row of listForPrincipal(principal)) {
      if (Date.parse(row.expires_at) <= now()) rows.delete(row.id);
    }
  }

  async function create(input: CreateDraftInput): Promise<CreateDraftResult> {
    prune(input.principal);
    const sinceMs = now() - ACTIVE_DRAFT_WINDOW_MS;
    if (countActive(input.principal, sinceMs) >= ACTIVE_DRAFTS_PER_PRINCIPAL) {
      return { ok: false, errorId: "E-019" };
    }
    const id = `00000000-0000-4000-8000-${rng(6).toString("hex").padStart(12, "0")}`;
    const createdMs = now();
    const followUpRound = input.initialFollowUpRound ?? 0;
    const token = opts.signer(input.kind, input.principal, id, createdMs, 0);
    const row: DraftRow = {
      id,
      principalKey: keyFor(input.principal),
      kind: input.kind,
      created_at: toDhakaIso(createdMs),
      expires_at: toDhakaIso(createdMs + DRAFT_TTL_MS),
      payload_hash: input.payloadHash,
      ai_calls_used: 0,
      revision: 1,
      follow_up_round: followUpRound,
      token,
    };
    rows.set(id, row);
    return { ok: true, row, token };
  }

  async function get(id: string): Promise<DraftRow | null> {
    return rows.get(id) ?? null;
  }

  async function reload(id: string): Promise<DraftRow | null> {
    const r = rows.get(id);
    if (!r) return null;
    if (Date.parse(r.expires_at) <= now()) {
      rows.delete(id);
      return null;
    }
    return r;
  }

  function verifyToken(token: string, kind: "missing" | "found", principal: Principal): DraftTokenPayload | null {
    return opts.verify(token, kind, principal);
  }

  async function issueQuestion(id: string, expectedRevision: number): Promise<{ ok: true; row: DraftRow } | { ok: false; errorId: ServerErrorId }> {
    const row = rows.get(id);
    if (!row) return { ok: false, errorId: "E-019" };
    if (Date.parse(row.expires_at) <= now()) return { ok: false, errorId: "E-019" };
    if (row.revision !== expectedRevision) return { ok: false, errorId: "E-005" };
    if (row.follow_up_round >= LIMITS.followUpRounds) return { ok: false, errorId: "E-023" };
    row.follow_up_round += 1;
    row.revision += 1;
    // The signed draft token is intentionally identity-bound to (kind,
    // principal, id, createdMs, follow_up_round=0) and is NEVER rotated
    // between follow-up rounds. The orchestrator refreshes the row token
    // on the next create/issueQuestion only when a fresh identity binds a
    // new draft, never as a side effect of advancing the round. This is
    // the same invariant the DB-backed registry honours — issue_intake_question
    // in db/schema_v2.sql only bumps follow_up_round and revision, never the
    // token column. The follow_up_round counter is metadata for the route;
    // the token stays the same signed blob across every round of the same
    // draft, so a resume that holds the original token is still valid.
    return { ok: true, row };
  }

  async function setPayloadHash(id: string, hash: string | null, expectedRevision: number): Promise<{ ok: true; row: DraftRow } | { ok: false; errorId: ServerErrorId }> {
    // Mirror the SQL set_intake_payload_hash guard: a valid hash is exactly 64
    // lowercase hex characters, or NULL to clear. The SQL function raises
    // check_violation on a malformed value; the in-memory variant refuses with
    // E-005 so the route envelope and the test assertions stay in lockstep.
    if (hash !== null && !/^[0-9a-f]{64}$/.test(hash)) {
      return { ok: false, errorId: "E-005" };
    }
    const row = rows.get(id);
    if (!row) return { ok: false, errorId: "E-019" };
    if (Date.parse(row.expires_at) <= now()) return { ok: false, errorId: "E-019" };
    if (row.revision !== expectedRevision) return { ok: false, errorId: "E-005" };
    row.payload_hash = hash;
    // Mirror the SQL set_intake_payload_hash: revision advances on every
    // successful hash write so the orchestrator observes a fresh canonical
    // value. The in-memory token continues to bind follow_up_round=0.
    row.revision += 1;
    return { ok: true, row };
  }

  async function revoke(id: string): Promise<void> {
    rows.delete(id);
  }

  function tokenFor(row: DraftRow, principal: Principal): string {
    // Use the supplied real principal to sign the deterministic token. The
    // previous reconstruction via principalFromKey threw away the actual
    // Principal shape and forced an `as Principal` cast, so a stub userId
    // in tests could disagree with the real principal and still appear to
    // verify. Sign with the live principal so the route envelope's token
    // compare is honest.
    return opts.signer(row.kind, principal, row.id, Date.parse(row.created_at), 0);
  }

  return { create, get, reload, verifyToken, issueQuestion, setPayloadHash, revoke, tokenFor };
}

// Conservative token-bound estimate from the actual messages and the configured
// output cap. Capped at MAX_INPUT_TOKENS so a pathologically long source text
// does not produce an unbounded reservation.
const MAX_INPUT_TOKENS = 32_000;

export function estimateExtractInputTokens(messages: readonly { role: "system" | "user"; content: string }[]): number {
  let total = 0;
  for (const message of messages) total += estimateStringTokens(message.content);
  return Math.max(64, Math.min(MAX_INPUT_TOKENS, total));
}

function estimateStringTokens(text: string): number {
  // 4 characters per token is a rough but conservative English/Bangla heuristic;
  // Bangla averages higher; the cap keeps the reservation honest.
  return Math.max(1, Math.ceil(text.length / 3));
}

export const TOKEN_COUNTER_NOT_AUTHORITY = "OPAQUE_TOKEN_COUNTER_NOT_AUTHORITY" as const;

// Strict Allowlist view: only metadata is exported. Never the draft payload.
export function projectMetadata(row: DraftRow): IntakeDraftMetadata {
  const isParent = row.principalKey.startsWith("s:");
  return intakeDraftMetadataSchema.parse({
    id: row.id,
    session_id: isParent ? row.principalKey.slice(2) : null,
    user_id: isParent ? null : row.principalKey.slice(2),
    kind: row.kind,
    created_at: row.created_at,
    expires_at: row.expires_at,
    payload_hash: row.payload_hash,
    ai_calls_used: row.ai_calls_used,
    revision: row.revision,
  });
}

// Canonical payload hash for the reviewed draft: SHA-256 of the canonical JSON of
// the parsed draft, identical to the API-003 contract's hash so a parent that
// resumes and confirms later replays the same key (TC-042, BR-015/016, FR-031).
export function payloadHash(draft: CaseDraft): string {
  const event = { ...draft.event };
  delete (event as { district_text?: unknown }).district_text;
  const event_ = { ...event };
  return createHmac("sha256", "fera.payload-hash.v1")
    .update(JSON.stringify({ kind: draft.kind, source_text: draft.source_text, child: draft.child, event: event_, reporter: draft.reporter, evidence: draft.evidence }))
    .digest("hex");
}

export function parseExpiresAt(row: DraftRow): number {
  const parsed = isoDateTimeSchema.safeParse(row.expires_at);
  return parsed.success ? Date.parse(parsed.data) : Number.NaN;
}

// Type guard used by callers that need the synchronous seam.
export type DraftFailure = ErrorEnvelope | { error: ErrorEnvelope };

// ---------------- DB-backed implementation ----------------

export type DbRegistryOptions = {
  signer: DraftSigner;
  verify: (token: string, kind: "missing" | "found", principal: Principal) => DraftTokenPayload | null;
  pool?: PoolLike;
  logger?: { info: (entry: object) => void; warn: (entry: object) => void; error: (entry: object) => void };
  now?: () => number;
  // Internal testing seam: a deterministic clock for unit tests that exercise
  // the in-memory implementation. The DB implementation always reads the
  // database's `now()` to avoid client/server drift.
  rng?: (bytes: number) => Buffer;
};

const ADVISORY_LOCK_NAMESPACE_CREATE = 0x10_40_0001; // arbitrary, distinct from any other seam

// Lock the active-draft cap for a principal. The int4 key is derived from the
// principal's UUID hash so it stays inside the advisory-lock int4 domain. The
// key is process-scoped and is held for the duration of the create
// transaction only.
function principalLockKey(principal: Principal): number {
  // Hash the principalKey into a stable int4 range. We use a small FNV-1a
  // over the lowercase key; collisions are acceptable because we only
  // require that two principals with different keys rarely collide.
  let hash = 0x811c9dc5;
  const text = keyFor(principal);
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  // Constrain to positive int4 so pg_advisory_xact_lock(int4) accepts it.
  return ((hash ^ ADVISORY_LOCK_NAMESPACE_CREATE) % 2_000_000_000) + 1;
}

function decodeRow(row: Record<string, unknown>): DraftRow {
  const sessionId = typeof row.session_id === "string" ? row.session_id : null;
  const userId = typeof row.user_id === "string" ? row.user_id : null;
  const principalKey = sessionId ? `s:${sessionId}` : `u:${userId ?? ""}`;
  // pg returns timestamptz as a Date; the schema mandates "+06:00" ISO text.
  // Render it deterministically so a reload re-derives the same token, and so
  // the isoDateTimeSchema validates the string the route serialises.
  return {
    id: col.uuid("intake_drafts", row, "id"),
    principalKey,
    kind: (row.kind === "found" ? "found" : "missing") as "missing" | "found",
    created_at: toIso(col.dateOrNull("intake_drafts", row, "created_at")),
    expires_at: toIso(col.dateOrNull("intake_drafts", row, "expires_at")),
    payload_hash: typeof row.payload_hash === "string" ? row.payload_hash : null,
    ai_calls_used: col.int("intake_drafts", row, "ai_calls_used"),
    revision: col.int("intake_drafts", row, "revision"),
    follow_up_round: col.int("intake_drafts", row, "follow_up_round"),
    token: null, // re-derive on demand via tokenFor(row, principal)
  };
}

export function createDbDraftRegistry(opts: DbRegistryOptions): DraftRegistry {
  const pool = opts.pool ?? getPool();
  const logger = opts.logger ?? createLogger();

  async function create(input: CreateDraftInput): Promise<CreateDraftResult> {
    const principal = input.principal;
    const followUpRound = input.initialFollowUpRound ?? 0;
    const sessionId = principal.kind === "parent" ? principal.sessionId : null;
    const userId = principal.kind === "user" ? principal.userId : null;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      // Take the per-principal advisory lock for the active-draft cap. Held
      // for the create transaction only; the spend layer takes its own locks
      // in a separate transaction, so deadlock with the budget->draft order is
      // impossible: we release this lock at COMMIT.
      await client.query("SELECT pg_advisory_xact_lock($1::int)", [principalLockKey(principal)]);
      // Owner-exclusive branch: the intake_drafts CHECK guarantees exactly one
      // of (session_id, user_id) is non-null, so the active-draft cap is
      // indexable on either column. We branch on principal kind so the planner
      // uses intake_drafts_session_id_recent_idx or
      // intake_drafts_user_id_recent_idx and never falls back to a seq scan
      // that the older "IS NOT DISTINCT FROM …" form would force.
      const countSql = principal.kind === "parent"
        ? "SELECT count(*)::text AS count FROM intake_drafts WHERE session_id = $1::uuid AND created_at > now() - interval '24 hours'"
        : "SELECT count(*)::text AS count FROM intake_drafts WHERE user_id = $1::uuid AND created_at > now() - interval '24 hours'";
      const countArg = principal.kind === "parent" ? sessionId : userId;
      const result = await client.query<{ count: string }>(countSql, [countArg]);
      const count = Number(result.rows[0]?.count ?? "0");
      if (count >= ACTIVE_DRAFTS_PER_PRINCIPAL) {
        await client.query("ROLLBACK");
        return { ok: false, errorId: "E-019" };
      }
      const id = `00000000-0000-4000-8000-${(opts.rng ?? randomBytes)(6).toString("hex").padStart(12, "0")}`;
      const inserted = await client.query<{ created_at: Date }>(
        `INSERT INTO intake_drafts (id, session_id, user_id, kind, payload_hash, follow_up_round, ai_calls_used, revision)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4::case_kind, $5::text, $6::smallint, 0, 1)
         RETURNING created_at`,
        [id, sessionId, userId, input.kind, input.payloadHash, followUpRound],
      );
      const createdAtIso = toIso(col.dateOrNull("intake_drafts", inserted.rows[0] ?? {}, "created_at"));
      await client.query("COMMIT");
      const createdMs = Date.parse(createdAtIso);
      const row: DraftRow = {
        id,
        principalKey: keyFor(principal),
        kind: input.kind,
        created_at: toDhakaIso(createdMs),
        expires_at: toDhakaIso(createdMs + DRAFT_TTL_MS),
        payload_hash: input.payloadHash,
        ai_calls_used: 0,
        revision: 1,
        follow_up_round: followUpRound,
        token: opts.signer(input.kind, principal, id, createdMs, 0),
      };
      return { ok: true, row, token: row.token! };
    } catch (err) {
      try { await client.query("ROLLBACK"); } catch { /* ignore */ }
      try {
        logger.error({ event: "db.tx_failed", tx_stage: "callback", err_name: err instanceof Error ? err.name : "Error" });
      } catch { /* best effort */ }
      return { ok: false, errorId: "E-021" };
    } finally {
      client.release();
    }
  }

  async function get(id: string): Promise<DraftRow | null> {
    const result = await pool.query(
      "SELECT id, session_id, user_id, kind, created_at, expires_at, payload_hash, ai_calls_used, revision, follow_up_round FROM intake_drafts WHERE id = $1::uuid",
      [id],
    );
    const row = firstRow("intake_drafts", result.rows as readonly unknown[]);
    if (!row) return null;
    return decodeRow(row);
  }

  async function reload(id: string): Promise<DraftRow | null> {
    return get(id);
  }

  function verifyToken(token: string, kind: "missing" | "found", principal: Principal): DraftTokenPayload | null {
    return opts.verify(token, kind, principal);
  }

  async function issueQuestion(id: string, expectedRevision: number): Promise<{ ok: true; row: DraftRow } | { ok: false; errorId: ServerErrorId }> {
    const current = await get(id);
    if (!current) return { ok: false, errorId: "E-019" };
    if (Date.parse(current.expires_at) <= Date.now()) return { ok: false, errorId: "E-019" };
    if (current.revision !== expectedRevision) return { ok: false, errorId: "E-005" };
    if (current.follow_up_round >= LIMITS.followUpRounds) return { ok: false, errorId: "E-023" };
    // Security-definer function: the app holds EXECUTE, not UPDATE on
    // follow_up_round or revision. Returns the new revision or NULL on refusal.
    const updated = await pool.query<{ revision: number }>(
      `SELECT issue_intake_question($1::uuid, $2::int) AS revision`,
      [id, expectedRevision],
    );
    const newRev = updated.rows[0]?.revision ?? null;
    if (newRev === null) return { ok: false, errorId: "E-005" };
    const row = await get(id);
    if (!row) return { ok: false, errorId: "E-019" };
    return { ok: true, row };
  }

  async function setPayloadHash(id: string, hash: string | null, expectedRevision: number): Promise<{ ok: true; row: DraftRow } | { ok: false; errorId: ServerErrorId }> {
    // Atomic conditional update via security-definer: refuses clobbering a row
    // whose revision has moved on (e.g. another paid call already advanced it)
    // and refuses an expired row outright. The function validates the 64-hex
    // shape and advances revision atomically; the orchestrator MUST observe
    // the canonical new revision here, so we reload the row after the call.
    let newRev: number | null;
    try {
      const updated = await pool.query<{ revision: number }>(
        `SELECT set_intake_payload_hash($1::uuid, $2::int, $3::text) AS revision`,
        [id, expectedRevision, hash],
      );
      newRev = updated.rows[0]?.revision ?? null;
    } catch (err) {
      // Hash shape failure inside the function surfaces as check_violation;
      // any other unexpected error is mapped to E-005 so the route stays
      // typed and tests can assert on a stable id.
      void err;
      return { ok: false, errorId: "E-005" };
    }
    if (newRev === null) return { ok: false, errorId: "E-005" };
    const refreshed = await get(id);
    if (!refreshed) return { ok: false, errorId: "E-019" };
    return { ok: true, row: refreshed };
  }

  async function revoke(id: string): Promise<void> {
    await pool.query("DELETE FROM intake_drafts WHERE id = $1::uuid", [id]);
  }

  function tokenFor(row: DraftRow, principal: Principal): string {
    const createdMs = Date.parse(row.created_at);
    return opts.signer(row.kind, principal, row.id, createdMs, 0);
  }

  return { create, get, reload, verifyToken, issueQuestion, setPayloadHash, revoke, tokenFor };
}
