// API-008 GET /api/review-queue (TASK-027; FR-012; SCREEN-009; D2A §5.4; COMP-035/036).
// Owner: Masnun. The review-queue service for an active verified officer.
//
// - Returns every missing case with at least one pending candidate, grouped per
//   case. Candidates are ordered by similarity descending; only the best
//   LIMITS.candidatesPerQueueItem per case survive into the projection (API-008,
//   `queueCandidateSchema.qualified = true`).
// - Cases and counterparts are projected through `projectQueueFor`; only verified
//   officers receive data (BR-007). Anyone else — parent, staff, unverified
//   officer, admin — is hidden with no queue case FK in the access.denied audit,
//   and the route answers E-004 (record-route rule, D2A §9.3; the matrix in §9.2
//   gives admin None and the contract would otherwise be a metadata-only view).
// - Confirmed, rejected and voided candidates are never listed (BR-013, BR-020).
// - No contact_viewed audit: the queue row serves a masked phone (`officerCaseRow`,
//   `contact_phone: null`); the raw phone is only served by API-009 (D2A §5.4).
// - The cursor is HMAC-signed (subkey(AUTH_SECRET, "cursor.review_queue")) so a
//   forged or tampered cursor fails E-001 (a 400) and never produces a hidden
//   E-004 / access.denied audit row (D2A §9.3, contract cursorSchema).
// - Each candidate is `qualified` only when the candidate's stored versions
//   still match the cases' current versions, both endpoints are in a queue
//   status, and neither is redacted. A candidate that fails the check is
//   dropped; a missing case whose every candidate fails is omitted from the
//   projection (CN-09 — the same predicate as API-009).
import { createHmac, timingSafeEqual } from "node:crypto";
import { ApiError } from "@/app/api/_shared/envelope";
import {
  LIMITS,
  isUuid,
  type ReviewQueueResponse,
} from "@/contracts";
import {
  effectiveRole,
  projectQueueFor,
  type OfficerContext,
  type Principal,
  type QueueItemInput,
} from "@/contracts/server";
import { loadSecret, subkey } from "@/server/auth/secrets";
import { getCaseRow, officerContext, withTransaction } from "@/server/case/internal";
import { QUEUE_STATUSES } from "@/server/case/rows";
import { RowShapeError, asRow, col } from "@/server/db/decode";
import type { Queryable } from "@/server/db/queryable";

const MC = "match_candidates";
const Q_MAX = LIMITS.candidatesPerQueueItem;
const DEFAULT_LIMIT = 20;
const CURSOR_PURPOSE = "cursor.review_queue";

export type ReadReviewQueueOpts = {
  district?: number;
  limit?: number;
  cursor?: string;
};

export type ReadReviewQueueResult =
  | { kind: "ok"; view: ReviewQueueResponse }
  | { kind: "hidden" };

export type ReadReviewQueueDeps = {
  withTransaction: typeof withTransaction;
  // Tests inject a fixed key so the cursor stays stable across the run; production
  // derives the subkey from AUTH_SECRET (D2B §15.1).
  cursorKey?: Buffer;
};
const defaultDeps: ReadReviewQueueDeps = { withTransaction };

// Components are the small set of similarity sub-scores the matcher
// produces (cosine + per-field agree/compare signals). The schema is the
// contract: anything else would mean DTO drift. The allowlist guards that
// contract here so a future schema migration cannot silently widen the
// field set projected to the queue.
const COMPONENT_KEYS = new Set(["cosine", "name", "clothing", "district", "age"]);
function decodeComponents(value: unknown): Record<string, number | null> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new RowShapeError(MC, "components");
  const out: Record<string, number | null> = {};
  for (const [key, v] of Object.entries(value)) {
    if (!COMPONENT_KEYS.has(key)) throw new RowShapeError(MC, "components");
    if (v !== null && (typeof v !== "number" || !Number.isFinite(v))) throw new RowShapeError(MC, "components");
    out[key] = v;
  }
  return out;
}

// --- signed cursor ----------------------------------------------------------
// `base64url(json) "." base64url(hmacSha256)`, the same shape as cursorSchema
// in src/contracts/primitives.ts. The payload is `{ v: 2, afterCreatedAt, afterMissingId }` —
// no district (the route filter lives in the request, not the cursor). A
// missing/short/short payload or a bad signature returns null, which the
// route layer maps to E-001 (not a denial).

function cursorKeyFor(deps: ReadReviewQueueDeps): Buffer {
  return deps.cursorKey ?? subkey(loadSecret("AUTH_SECRET"), CURSOR_PURPOSE);
}

function macSig(key: Buffer, payload: string): string {
  return createHmac("sha256", key).update(payload).digest("base64url");
}

type QueueCursor = { afterCreatedAt: string; afterMissingId: string };

function isCursorTimestamp(value: unknown): value is string {
  return typeof value === "string" &&
    value.length <= 64 &&
    /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}(?::?\d{2})?)$/.test(value) &&
    Number.isFinite(Date.parse(value));
}

function encodeQueueCursor(
  afterMissingId: string,
  deps: ReadReviewQueueDeps,
  afterCreatedAt = new Date().toISOString(),
): string {
  const payload = Buffer.from(JSON.stringify({ v: 2, afterCreatedAt, afterMissingId }), "utf8").toString("base64url");
  return `${payload}.${macSig(cursorKeyFor(deps), payload)}`;
}

function decodeQueueCursor(cursor: string, deps: ReadReviewQueueDeps): QueueCursor | null {
  const [payload, sig, extra] = cursor.split(".");
  if (!payload || !sig || extra !== undefined) return null;
  const want = Buffer.from(macSig(cursorKeyFor(deps), payload));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const value: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (typeof value !== "object" || value === null) return null;
    const { v, afterCreatedAt, afterMissingId } = value as {
      v?: unknown;
      afterCreatedAt?: unknown;
      afterMissingId?: unknown;
    };
    if (v !== 2 || !isCursorTimestamp(afterCreatedAt)) return null;
    if (typeof afterMissingId !== "string") return null;
    if (!isUuid(afterMissingId)) return null;
    return { afterCreatedAt, afterMissingId };
  } catch {
    return null;
  }
}

// One pass: missing cases with pending candidates (district-filtered), then their
// pending candidates and counterparts. Capped per case at Q_MAX; over-fetched by a
// small margin so the cursor boundary still lands on a full page.
async function readQueueRows(
  client: Queryable,
  district: number | undefined,
  limit: number,
  after: QueueCursor | null,
): Promise<{ items: QueueItemInput[]; createdAtByMissingId: Map<string, string> }> {
  // Page the missing side generously so a case with >Q_MAX pending candidates still
  // leaves a usable page boundary. Newest cases appear first (D1_PRD_V2 §6); UUID
  // is the deterministic tie-breaker and both values are carried by the cursor.
  const missingLimit = Math.max(limit * 2, limit + Q_MAX);
  const params: unknown[] = [];
  let districtClause = "";
  if (district !== undefined) {
    params.push(district);
    districtClause = `AND m.district_code = $${params.length}`;
  }
  let cursorClause = "";
  if (after !== null) {
    params.push(after.afterCreatedAt, after.afterMissingId);
    cursorClause = `AND (m.created_at, m.id) < ($${params.length - 1}::timestamptz, $${params.length}::uuid)`;
  }
  params.push(missingLimit);
  const missingLimitClause = `LIMIT $${params.length}`;
  const missingRows = await client.query(
    `SELECT m.id AS id, m.created_at::text AS created_at
       FROM cases m
      WHERE m.kind = 'missing'
        AND m.status = 'matched_pending_review'
        AND m.anonymised_at IS NULL
        AND EXISTS (SELECT 1 FROM match_candidates c
                    WHERE c.missing_case_id = m.id
                      AND c.status = 'pending'
                      AND NOT EXISTS (SELECT 1 FROM cases fc
                                      WHERE fc.id = c.found_case_id
                                        AND fc.anonymised_at IS NOT NULL))
        ${districtClause}
        ${cursorClause}
      ORDER BY m.created_at DESC, m.id DESC
      ${missingLimitClause}`,
    params,
  );
  const missingCases = missingRows.rows.map((raw) => {
    const row = asRow("cases", raw);
    return {
      id: col.uuid("cases", row, "id"),
      createdAt: col.text("cases", row, "created_at"),
    };
  });
  const caseIds = missingCases.map((row) => row.id);
  const createdAtByMissingId = new Map(missingCases.map((row) => [row.id, row.createdAt]));
  if (caseIds.length === 0) return { items: [], createdAtByMissingId };

  // Candidates for those missing cases, ordered by missing_case then similarity desc
  // then rank asc. Best per case first; we slice to Q_MAX in JS so a sub-5 candidate
  // list never serves partial rows.
  const cand = await client.query(
    `SELECT id, missing_case_id, found_case_id, missing_version, found_version,
            score, rank, reason_bn, reason_en, components
       FROM match_candidates
      WHERE status = 'pending'
        AND missing_case_id = ANY($1::uuid[])
      ORDER BY missing_case_id, score DESC, rank ASC, id ASC`,
    [caseIds],
  );

  // Group candidates by missing case, bounded to Q_MAX each.
  type CandRow = {
    id: string;
    foundId: string;
    missingVersion: number;
    foundVersion: number;
    rank: number;
    score: number;
    reasonBn: string;
    reasonEn: string;
    components: Record<string, number | null>;
  };
  const candByCase = new Map<string, CandRow[]>();
  const foundIds = new Set<string>();
  for (const raw of cand.rows) {
    const r = asRow(MC, raw);
    const missingId = col.uuid(MC, r, "missing_case_id");
    const foundId = col.uuid(MC, r, "found_case_id");
    const rank = col.int(MC, r, "rank");
    if (rank < 1 || rank > Q_MAX) continue; // schema CHECK bounds it; defensive
    const list = candByCase.get(missingId) ?? [];
    if (list.length >= Q_MAX) continue;
    list.push({
      id: col.uuid(MC, r, "id"),
      foundId,
      missingVersion: col.int(MC, r, "missing_version"),
      foundVersion: col.int(MC, r, "found_version"),
      rank,
      score: col.numeric(MC, asRow(MC, r), "score"),
      reasonBn: col.text(MC, r, "reason_bn"),
      reasonEn: col.text(MC, r, "reason_en"),
      components: decodeComponents(r.components),
    });
    candByCase.set(missingId, list);
    foundIds.add(foundId);
  }

  // Resolve every missing case row once.
  const missingRowsResolved = await Promise.all(caseIds.map((id) => getCaseRow(client, id)));
  // Resolve every unique found row once.
  const foundRowsById = new Map<string, NonNullable<Awaited<ReturnType<typeof getCaseRow>>>>();
  for (const fid of foundIds) {
    const row = await getCaseRow(client, fid);
    if (row) foundRowsById.set(fid, row);
  }
  // Pre-compute officer contexts for every distinct (caseId, district) pair.
  const ctxByMissing = new Map<string, OfficerContext>();
  for (let i = 0; i < caseIds.length; i++) {
    const row = missingRowsResolved[i];
    if (!row) continue;
    ctxByMissing.set(caseIds[i], await officerContext(client, row.id, row.district_code));
  }
  const ctxByFound = new Map<string, OfficerContext>();
  for (const [fid, row] of foundRowsById) {
    ctxByFound.set(fid, await officerContext(client, row.id, row.district_code));
  }

  const items: QueueItemInput[] = [];
  for (let i = 0; i < caseIds.length; i++) {
    const missingId = caseIds[i];
    const missingRow = missingRowsResolved[i];
    if (!missingRow) continue;
    const mctx = ctxByMissing.get(missingId) ?? { districtNameBn: null, duplicateOf: [] };
    const candidates = candByCase.get(missingId) ?? [];
    const qualifiedCandidates: Array<QueueItemInput["candidates"][number]> = [];
    for (const c of candidates) {
      const frow = foundRowsById.get(c.foundId);
      const fctx = ctxByFound.get(c.foundId);
      if (!frow || !fctx) continue;
      // Qualified predicate, mirrored from src/server/matching/candidate-read.ts:
      // the candidate was made for these versions and both endpoints are still
      // in a queue status and not redacted. A failure drops this candidate; a
      // missing case whose every candidate fails is dropped at the items filter
      // below.
      const qualified =
        missingRow.version === c.missingVersion &&
        frow.version === c.foundVersion &&
        QUEUE_STATUSES.includes(missingRow.status) &&
        QUEUE_STATUSES.includes(frow.status) &&
        missingRow.anonymised_at === null &&
        frow.anonymised_at === null;
      if (!qualified) continue;
      qualifiedCandidates.push({
        candidateId: c.id,
        rank: c.rank,
        score: c.score,
        reasonBn: c.reasonBn,
        reasonEn: c.reasonEn,
        components: c.components,
        qualified: true,
        counterpart: frow,
        counterpartCtx: fctx,
      });
    }
    if (qualifiedCandidates.length === 0) continue; // a missing case with no live candidates is hidden
    items.push({ row: missingRow, ctx: mctx, candidates: qualifiedCandidates });
  }
  return { items, createdAtByMissingId };
}

export async function readReviewQueue(
  principal: Principal,
  opts: ReadReviewQueueOpts = {},
  deps: ReadReviewQueueDeps = defaultDeps,
): Promise<ReadReviewQueueResult> {
  // Only active verified officers reach the data path. Everyone else is hidden.
  if (effectiveRole(principal) !== "officer") return { kind: "hidden" };

  // Defence in depth: the route's query schema already enforces 1..64, but a
  // service caller could pass any number. An out-of-range district is a
  // validation failure (E-001), not a denial.
  if (opts.district !== undefined && (!Number.isInteger(opts.district) || opts.district < 1 || opts.district > 64)) {
    throw new ApiError("E-001", { reason: "schema" });
  }

  const limit = Math.min(Math.max(opts.limit ?? DEFAULT_LIMIT, 1), 50);
  const district = opts.district;
  const after = opts.cursor ? decodeQueueCursor(opts.cursor, deps) : null;
  if (opts.cursor !== undefined && after === null) {
    throw new ApiError("E-001", { reason: "schema" });
  }

  return deps.withTransaction(async (client) => {
    // One snapshot for every read; an edit between the SELECTs could expose a
    // candidate whose endpoints have moved on (BR-019/020).
    await client.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
    const result = await readQueueRows(client, district, limit, after);
    const page = result.items.slice(0, limit);
    let nextCursor: string | null = null;
    if (result.items.length > limit && page.length > 0) {
      const last = page[page.length - 1];
      const createdAt = result.createdAtByMissingId.get(last.row.id);
      if (createdAt === undefined) throw new RowShapeError("cases", "created_at");
      nextCursor = encodeQueueCursor(last.row.id, deps, createdAt);
    }
    const view = projectQueueFor(principal, page, nextCursor);
    if (!view) return { kind: "hidden" } as const;
    return { kind: "ok", view } as const;
  });
}

// Exported for the API route test (and any future cursor-issuer): the
// callers that issue cursors must use the same key, so the cursor stays
// HMAC-verifyable by the service. Tests inject a fixed key; production
// derives it from AUTH_SECRET.
export { encodeQueueCursor, decodeQueueCursor, cursorKeyFor, CURSOR_PURPOSE };
