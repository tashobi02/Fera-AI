// Draft row helpers (TASK-014/020, FR-002/004, BR-004/023, TC-002/043/060).
//
// Before any provider dispatch, the route stores a metadata-only draft row. The row
// holds: kind, principal scope (session_id or user_id), created_at, expires_at,
// payload_hash, ai_calls_used, revision, follow_up_round. No transcript, no
// reviewed text, no child payload is ever stored here. The stored row is
// authoritative for both paid-call usage and issued-question rounds; the signed
// token's embedded counter is never trusted (D2A §9.4).
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { LIMITS, draftTokenSchema, isoDateTimeSchema, toDhakaIso, type CaseDraft, type ErrorEnvelope, type ServerErrorId } from "@/contracts";
import { intakeDraftMetadataSchema, type IntakeDraftMetadata, type Principal } from "@/contracts/server";

const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;
const TOKEN_BRAND = "syn.draft.v1";
const tokenScope = (principal: Principal): string => principal.kind === "parent" ? `s-${principal.sessionId}` : `u-${principal.userId}`;

export type DraftSigner = (kind: "missing" | "found", principal: Principal, draftId: string, createdMs: number, followUpRound: number) => string;

// A small deterministic signer: bound to (kind, principal id, draft id, createdAt,
// followUpRound) and a per-instance secret. The secret lives on the server; the
// client never sees it, and the route layer keeps the only reference.
export function createDraftSigner(secret: Buffer): DraftSigner {
  if (!Buffer.isBuffer(secret) || secret.length < 16) throw new Error("DRAFT_SIGN_SECRET must be at least 16 bytes");
  return (kind, principal, draftId, createdMs, followUpRound) => {
    const principalKey = tokenScope(principal);
    const body = `${TOKEN_BRAND}.${kind}.${principalKey}.${draftId}.${createdMs}.${followUpRound}`;
    const sig = createHmac("sha256", secret).update(body).digest("base64url").slice(0, 32);
    return `${body}.${sig}`;
  };
}

// Verifies a token: same brand, same (kind, principal, draftId, createdAt, followUpRound).
// Returns the embedded fields, or null on any mismatch. The followUpRound is reported
// back to the orchestrator only as a hint; the row's stored follow_up_round is the
// authoritative counter (D2A §9.4).
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

// Local in-memory implementation of the draft store. The route layer can swap in a
// database-backed implementation later; the API surface (return shapes, errors, and
// the row-level invariants) stays stable.
//
// The counter is a per-principal tally of active draft rows. At most
// LIMITS.activeDraftsPerPrincipal (3) drafts may exist in the 24h window before the
// route returns E-019 (a fresh intake is only allowed once a previous draft has
// been confirmed or expired). This is the per-principal cap called out in the
// user-delegated decisions of 18 Oct.
export const ACTIVE_DRAFTS_PER_PRINCIPAL = 3;
export const ACTIVE_DRAFT_WINDOW_MS = 24 * 60 * 60 * 1000;

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
  // In-memory cache: which token currently authorises this row. Cleared when the
  // draft is consumed (CONFIRMED) or revoked. The route layer calls the registry's
  // begin / commit / revoke methods; nothing else mutates it.
  token: string | null;
};

type PrincipalKey = string;

export type DraftRegistryOptions = {
  signer: DraftSigner;
  verify: (token: string, kind: "missing" | "found", principal: Principal) => DraftTokenPayload | null;
  now?: () => number;
  rng?: (bytes: number) => Buffer;
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

export function createDraftRegistry(opts: DraftRegistryOptions) {
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
      if (Date.parse(row.expires_at) <= now()) {
        rows.delete(row.id);
      }
    }
  }

  function create(input: CreateDraftInput): CreateDraftResult {
    prune(input.principal);
    const sinceMs = now() - ACTIVE_DRAFT_WINDOW_MS;
    if (countActive(input.principal, sinceMs) >= ACTIVE_DRAFTS_PER_PRINCIPAL) {
      return { ok: false, errorId: "E-019" };
    }
    const id = `00000000-0000-4000-8000-${rng(6).toString("hex").padStart(12, "0")}`;
    const createdMs = now();
    const followUpRound = input.initialFollowUpRound ?? 0;
    const token = opts.signer(input.kind, input.principal, id, createdMs, followUpRound);
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

  function get(id: string): DraftRow | null {
    return rows.get(id) ?? null;
  }

  function verifyToken(token: string, kind: "missing" | "found", principal: Principal): DraftTokenPayload | null {
    return opts.verify(token, kind, principal);
  }

  function issueQuestion(
    id: string,
    expectedRevision: number,
  ): { ok: true; row: DraftRow } | { ok: false; errorId: ServerErrorId } {
    const row = rows.get(id);
    if (!row || row.token === null) return { ok: false, errorId: "E-019" };
    if (Date.parse(row.expires_at) <= now()) return { ok: false, errorId: "E-019" };
    if (row.revision !== expectedRevision) return { ok: false, errorId: "E-005" };
    if (row.follow_up_round >= LIMITS.followUpRounds) return { ok: false, errorId: "E-023" };
    row.follow_up_round += 1;
    row.revision += 1;
    return { ok: true, row };
  }

  function recordPaidCall(id: string, expectedRevision: number): { ok: true; row: DraftRow } | { ok: false; errorId: ServerErrorId } {
    const row = rows.get(id);
    if (!row) return { ok: false, errorId: "E-019" };
    if (row.token === null) return { ok: false, errorId: "E-019" };
    if (Date.parse(row.expires_at) <= now()) return { ok: false, errorId: "E-019" };
    if (row.ai_calls_used >= LIMITS.aiCallsPerDraft) return { ok: false, errorId: "E-023" };
    if (row.revision !== expectedRevision) return { ok: false, errorId: "E-005" };
    row.ai_calls_used += 1;
    row.revision += 1;
    return { ok: true, row };
  }

  // Kept as an alias for callers already using the original registry seam.
  const consumeCall = recordPaidCall;

  function setPayloadHash(id: string, hash: string | null): void {
    const row = rows.get(id);
    if (row) row.payload_hash = hash;
  }

  function revoke(id: string): void {
    rows.delete(id);
  }

  return { create, get, verifyToken, issueQuestion, recordPaidCall, consumeCall, setPayloadHash, revoke, _rows: rows };
}

export type DraftRegistry = ReturnType<typeof createDraftRegistry>;

// Strict Allowlist view: only metadata is exported. Never the draft payload.
export function projectMetadata(row: DraftRow): IntakeDraftMetadata {
  // route caller is responsible for the session_id / user_id split; the local
  // registry tracks principalKey so this projection builds the typed split.
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
  // event.district_text has no column (CN-06) and is never a payload-relevant field.
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

// Token never carries authority for the counter; the row does (D2A §9.4).
export const TOKEN_COUNTER_NOT_AUTHORITY = "OPAQUE_TOKEN_COUNTER_NOT_AUTHORITY" as const;

export type DraftFailure = ErrorEnvelope | { error: ErrorEnvelope };
