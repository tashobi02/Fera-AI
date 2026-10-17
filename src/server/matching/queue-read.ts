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
import { LIMITS, type ReviewQueueResponse } from "@/contracts";
import { effectiveRole, projectQueueFor, type OfficerContext, type Principal, type QueueItemInput } from "@/contracts/server";
import { getCaseRow, officerContext, withTransaction } from "@/server/case/internal";
import { RowShapeError, asRow, col } from "@/server/db/decode";
import type { Queryable } from "@/server/db/queryable";

const MC = "match_candidates";
const Q_MAX = LIMITS.candidatesPerQueueItem;
const DEFAULT_LIMIT = 20;

export type ReadReviewQueueOpts = {
  district?: number;
  limit?: number;
  cursor?: string;
};

export type ReadReviewQueueResult =
  | { kind: "ok"; view: ReviewQueueResponse }
  | { kind: "hidden" };

export type ReadReviewQueueDeps = { withTransaction: typeof withTransaction };
const defaultDeps: ReadReviewQueueDeps = { withTransaction };

function decodeComponents(value: unknown): Record<string, number | null> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new RowShapeError(MC, "components");
  const out: Record<string, number | null> = {};
  for (const [key, v] of Object.entries(value)) {
    if (v !== null && (typeof v !== "number" || !Number.isFinite(v))) throw new RowShapeError(MC, "components");
    out[key] = v;
  }
  return out;
}

// Opaque cursor payload: JSON { district, afterMissingId } encoded base64url. The
// queue is a read, so a forged cursor that decodes to an unseen slice just produces
// empty results. District is round-tripped so a district filter survives the page.
function encodeCursor(payload: { district: number | null; afterMissingId: string }): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodeCursor(value: string): { district: number | null; afterMissingId: string } | null {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (typeof parsed !== "object" || parsed === null) return null;
    const obj = parsed as Record<string, unknown>;
    const after = obj.afterMissingId;
    const district = obj.district;
    if (typeof after !== "string" || after.length === 0) return null;
    if (district !== null && typeof district !== "number") return null;
    return { district: district as number | null, afterMissingId: after };
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
  afterMissingId: string | null,
): Promise<QueueItemInput[]> {
  // Page the missing side generously so a case with >Q_MAX pending candidates still
  // leaves a usable page boundary. created_at desc + id desc is the deterministic
  // missing-side order.
  const missingLimit = Math.max(limit * 2, limit + Q_MAX);
  const params: unknown[] = [];
  let districtClause = "";
  if (district !== undefined) {
    params.push(district);
    districtClause = `AND m.district_code = $${params.length}`;
  }
  let cursorClause = "";
  if (afterMissingId !== null) {
    params.push(afterMissingId);
    cursorClause = `AND m.id < $${params.length}`;
  }
  params.push(missingLimit);
  const missingLimitClause = `LIMIT $${params.length}`;
  const missingRows = await client.query(
    `SELECT m.id AS id
       FROM cases m
      WHERE m.kind = 'missing'
        AND m.status = 'matched_pending_review'
        AND m.anonymised_at IS NULL
        AND EXISTS (SELECT 1 FROM match_candidates c
                    WHERE c.missing_case_id = m.id AND c.status = 'pending')
        ${districtClause}
        ${cursorClause}
      ORDER BY m.id DESC
      ${missingLimitClause}`,
    params,
  );
  const caseIds = missingRows.rows.map((r) => col.uuid("cases", asRow("cases", r), "id"));
  if (caseIds.length === 0) return [];

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
  const candByCase = new Map<string, Array<{
    id: string;
    foundId: string;
    rank: number;
    score: number;
    reasonBn: string;
    reasonEn: string;
    components: Record<string, number | null>;
  }>>();
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
    const candidates = candByCase.get(missingId) ?? [];
    const mctx = ctxByMissing.get(missingId) ?? { districtNameBn: null, duplicateOf: [] };
    items.push({
      row: missingRow,
      ctx: mctx,
      candidates: candidates.flatMap((c) => {
        const frow = foundRowsById.get(c.foundId);
        const fctx = ctxByFound.get(c.foundId);
        if (!frow || !fctx) return [];
        return [{
          candidateId: c.id,
          rank: c.rank,
          score: c.score,
          reasonBn: c.reasonBn,
          reasonEn: c.reasonEn,
          components: c.components,
          qualified: true,
          counterpart: frow,
          counterpartCtx: fctx,
        }];
      }),
    });
  }
  return items;
}

export async function readReviewQueue(
  principal: Principal,
  opts: ReadReviewQueueOpts = {},
  deps: ReadReviewQueueDeps = defaultDeps,
): Promise<ReadReviewQueueResult> {
  // Only active verified officers reach the data path. Everyone else is hidden.
  if (effectiveRole(principal) !== "officer") return { kind: "hidden" };
  const limit = Math.min(Math.max(opts.limit ?? DEFAULT_LIMIT, 1), 50);
  const district = opts.district;
  const cursor = opts.cursor ? decodeCursor(opts.cursor) : null;
  if (opts.cursor && cursor === null) return { kind: "hidden" };

  return deps.withTransaction(async (client) => {
    // One snapshot for every read; an edit between the SELECTs could expose a
    // candidate whose endpoints have moved on (BR-019/020).
    await client.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
    const afterMissingId = cursor?.afterMissingId ?? null;
    const rows = await readQueueRows(client, district, limit, afterMissingId);
    const page = rows.slice(0, limit);
    let nextCursor: string | null = null;
    if (rows.length > limit && page.length > 0) {
      const last = page[page.length - 1];
      nextCursor = encodeCursor({ district: district ?? null, afterMissingId: last.row.id });
    }
    const view = projectQueueFor(principal, page, nextCursor);
    if (!view) return { kind: "hidden" } as const;
    return { kind: "ok", view } as const;
  });
}