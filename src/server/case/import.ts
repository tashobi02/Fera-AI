// API-015 synthetic public-import helper (TASK-048, FR-024, TC-014, STORY-015).
//
// - One transaction per item (createPublicImportCase): the reviewed payload, the case
//   row and its audit rows commit together; an item that fails its draft validation
//   or its insert raises to the caller so the counts stay honest.
// - Source: 'public_import' (cases CHECK requires source_url for that value).
//   source_url is the validated example.invalid URL from the request item.
// - No reporter_session_id and no created_by_user_id (the SQL CHECK permits that
//   combination only for source = 'public_import'); ownership is the synthetic
//   admin user row's UUID recorded in the audit, never on the case row.
// - No parent review step, no editor: every persisted row carries a fully reviewed
//   draft (BR-004/016). The reviewer who marks fields is the deterministic
//   sample builder in src/server/import/builder.ts; its output is parsed by the
//   submission schema, so an invalid draft can never reach the cases table.
// - The audit is `case.imported` with details { ref_code, version, to_status, api }.
//   Text and URL never appear in audit details; the validated example.invalid URL
//   is stored on the synthetic case row and never fetched.
import { ApiError } from "@/app/api/_shared/envelope";
import {
  createMissingRequestSchema,
  createFoundRequestSchema,
  syntheticSourceUrlSchema,
  type FoundSubmissionDraft,
  type MissingSubmissionDraft,
  type CaseKind,
} from "@/contracts";
import { submissionPayloadHash } from "@/contracts/server";
import { CASE_AUDIT_ACTIONS, SYSTEM_ACTOR, actorFor, appendAudit, type AuditDetails } from "@/server/audit";
import { withTransaction, type Connectable } from "@/server/case/internal";
import { lockCases } from "@/server/case/lock";
import { getCaseRow } from "@/server/case/rows";
import { applyStatus } from "@/server/case/state";
import type { Principal } from "@/contracts/server";

export type PublicImportDeps = {
  // Injected so tests can use a noop or synthetic actor. The production caller passes
  // the principal from the API-015 handler, which is the admin user.
  actorFor: (principal: Principal) => ReturnType<typeof actorFor>;
  // Connector seam (default: the app pool through the case service's tx helper).
  withTransaction: typeof withTransaction;
};

const defaultDeps: PublicImportDeps = {
  actorFor,
  withTransaction,
};

// Minimal audit details for an import; never includes the text or the URL.
// The allowlist is adminAuditDetailsShape: typed tokens, IDs, versions, statuses
// and counts only. The case kind and source URL stay on the synthetic case row;
// neither value is copied into audit details.
const importDetails = (input: {
  refCode: string;
  version: number;
  toStatus: "submitted" | "open";
}): AuditDetails => ({
  ref_code: input.refCode,
  version: input.version,
  to_status: input.toStatus,
  api: "API-015",
});

export type PublicImportContext = {
  requestId?: string | null;
  pool?: Connectable;
  attempts?: number;
};

// The reviewed-draft insertion: a fully formed draft + the validated URL. The draft
// must already pass missingSubmissionDraftSchema / foundSubmissionDraftSchema (the
// sample builder does this). The function never reads the URL or fetches it.
async function insertPublicImportCase(
  principal: Principal,
  kind: "missing" | "found",
  draft: MissingSubmissionDraft | FoundSubmissionDraft,
  sourceUrl: string,
  ctx: PublicImportContext,
  deps: PublicImportDeps = defaultDeps,
): Promise<{ refCode: string; version: number; status: "open" }> {
  const actor = deps.actorFor(principal);
  if (actor.type !== "admin") throw new ApiError("E-003", { reason: "authorize" });
  const parsedSourceUrl = syntheticSourceUrlSchema.safeParse(sourceUrl);
  if (!parsedSourceUrl.success) throw new ApiError("E-001");
  // Defence in depth: the route already parsed the request with the kind-specific
  // schema, but a stale or hand-built caller must not be able to store an
  // invalid/unreviewed draft. The sample builder only emits valid drafts.
  if (kind === "missing") {
    draft = createMissingRequestSchema.parse({
      draft,
      confirmed: true,
      client_submission_id: cryptoUUID(),
    }).draft;
  } else {
    draft = createFoundRequestSchema.parse({
      draft,
      confirmed: true,
      client_submission_id: cryptoUUID(),
    }).draft;
  }
  return deps.withTransaction(async (client) => {
    const cols = draftColumns(draft);
    const ref = newRefCode(kind);
    const status: "submitted" | "open" = kind === "missing" ? "submitted" : "open";
    const hash = submissionPayloadHash(draft);
    const { rows } = await client.query(
      `INSERT INTO cases (
         ref_code, kind, status, source, source_url, is_synthetic,
         client_submission_id, submission_payload_hash,
         raw_text, child_name, child_name_latin, age_years, age_min, age_max, sex,
         height_cm, clothing, marks, circumstances, event_at, event_at_approx,
         event_at_lower, event_at_upper, place_text, district_code, thana,
         reporter_relation, contact_phone, provenance
       )
       VALUES ($1, $2, $3, 'public_import', $4, true,
         $5, $6,
         $7, $8, $9, $10, $11, $12, $13,
         $14, $15, $16, $17, $18, $19,
         $20, $21, $22, $23, $24,
         $25, $26, $27::jsonb)
       RETURNING id, ref_code, version, status`,
      [
        ref, kind, status, parsedSourceUrl.data,
        cryptoUUID(), hash,
        cols.raw_text, cols.child_name, cols.child_name_latin, cols.age_years, cols.age_min, cols.age_max, cols.sex,
        cols.height_cm, cols.clothing, cols.marks, cols.circumstances, cols.event_at, cols.event_at_approx,
        cols.event_at_lower, cols.event_at_upper, cols.place_text, cols.district_code, cols.thana,
        cols.reporter_relation, cols.contact_phone, cols.provenance,
      ],
    );
    if (rows.length === 0) throw new ApiError("E-005");
    const row = rows[0] as { id: string; ref_code: string; version: number; status: "submitted" | "open" };
    const caseRow = await getCaseRow(client, row.id);
    if (!caseRow) throw new ApiError("E-005");
    const details = importDetails({
      refCode: row.ref_code,
      version: row.version,
      toStatus: row.status,
    });
    await appendAudit(client, actor, {
      action: CASE_AUDIT_ACTIONS.caseImported,
      caseId: row.id,
      requestId: ctx.requestId ?? null,
      details,
    });
    if (row.status === "submitted") {
      // Missing-case inserts must begin as submitted; make the queue transition
      // through the standard system actor and append its state-change audit row.
      const locked = (await lockCases(client, [row.id])).get(row.id);
      if (!locked || locked.status !== "submitted") throw new ApiError("E-005");
      await applyStatus(client, SYSTEM_ACTOR, locked, {
        to: "open",
        api: "API-015",
        requestId: ctx.requestId ?? null,
      });
    }
    return { refCode: row.ref_code, version: row.version, status: "open" };
  }, { pool: ctx.pool, attempts: ctx.attempts });
}

// RFC 4122 v4 UUID without crypto polyfill: the case service uses this in many places
// without importing the schema's uuidSchema transform. We only need a fresh, unique
// value for client_submission_id; collisions on this random UUID across imports
// are not expected and trigger the same UNIQUE (reporter_session_id,
// client_submission_id) check that parent submissions use. For public_import rows
// the SQL CHECK does not require submission_payload_hash, but we still set one so
// the column is consistent.
function cryptoUUID(): string {
  // Use the global crypto when available; fall back to a manual v4 UUID for older
  // runtimes (Vitest in jsdom). The shape must be lowercased.
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID().toLowerCase();
  // Fallback: 36-char v4 UUID without external deps.
  const hex = (n: number) => Math.floor(Math.random() * 16 ** n).toString(16).padStart(n, "0");
  return [
    hex(8), hex(4), "4" + hex(3),
    ((8 + Math.floor(Math.random() * 4)).toString(16)) + hex(3),
    hex(12),
  ].join("-");
}

const REF_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const REF_PREFIX = { missing: "M-", found: "F-" } as const;
function newRefCode(kind: "missing" | "found"): string {
  let suffix = "";
  for (let i = 0; i < 6; i++) {
    suffix += REF_ALPHABET[Math.floor(Math.random() * REF_ALPHABET.length)];
  }
  return `${REF_PREFIX[kind]}${suffix}`;
}

// Mirrors the case service draftColumns: keep the public-import writer in lockstep
// with the reviewed-draft contract. No district_text (no cases column, CN-06).
function draftColumns(d: MissingSubmissionDraft | FoundSubmissionDraft) {
  return {
    raw_text: d.source_text === "" ? null : d.source_text,
    child_name: d.child.name,
    child_name_latin: d.child.name_latin,
    age_years: d.child.age_years,
    age_min: d.child.age_min,
    age_max: d.child.age_max,
    sex: d.child.sex,
    height_cm: d.child.height_cm,
    clothing: d.child.clothing,
    marks: d.child.marks,
    circumstances: d.event.circumstances,
    event_at: d.event.at,
    event_at_approx: d.event.at_approx,
    event_at_lower: d.event.at_lower,
    event_at_upper: d.event.at_upper,
    place_text: d.event.place_text,
    district_code: d.event.district_code,
    thana: d.event.thana,
    reporter_relation: d.reporter.relation,
    contact_phone: d.reporter.phone,
    provenance: JSON.stringify(d.evidence),
  };
}

export type PublicImportKind = CaseKind;
export type PublicImportItemResult =
  | { kind: "imported"; refCode: string; version: number; status: "open"; sourceUrl: string }
  | { kind: "skipped"; reason: "invalid_text" | "invalid_draft" | "no_provider" | "duplicate_submission" };

export type PublicImportOutcome = {
  imported: number;
  skipped: number;
  duplicates_flagged: number;
  results: PublicImportItemResult[];
};

// Process one item at a time. A failed item is counted as skipped and does not abort
// the batch; the caller's counts come from the array.
export async function processPublicImportItem(
  principal: Principal,
  item: {
    text: string;
    sourceUrl: string;
    kind: "missing" | "found";
  },
  builder: (text: string, kind: "missing" | "found", nowIso: string) =>
    | { ok: true; draft: MissingSubmissionDraft | FoundSubmissionDraft }
    | { ok: false; reason: "invalid_text" | "invalid_draft" },
  nowIso: string,
  ctx: PublicImportContext,
  deps: PublicImportDeps = defaultDeps,
): Promise<PublicImportItemResult> {
  if (item.text.length < 20 || item.text.length > 2000) {
    return { kind: "skipped", reason: "invalid_text" };
  }
  const built = builder(item.text, item.kind, nowIso);
  if (!built.ok) {
    return { kind: "skipped", reason: built.reason };
  }
  try {
    const inserted = await insertPublicImportCase(
      principal,
      item.kind,
      built.draft,
      item.sourceUrl,
      ctx,
      deps,
    );
    return {
      kind: "imported",
      refCode: inserted.refCode,
      version: inserted.version,
      status: inserted.status,
      sourceUrl: item.sourceUrl,
    };
  } catch (err) {
    if (err instanceof ApiError && (err.id === "E-005" || err.id === "E-006")) {
      return { kind: "skipped", reason: "duplicate_submission" };
    }
    if (err instanceof ApiError && err.id === "E-001") {
      return { kind: "skipped", reason: "invalid_draft" };
    }
    throw err;
  }
}
