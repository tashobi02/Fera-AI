// Audit logger (COMP-015, TASK-015; BR-010, FR-021, STORY-017). Appends one audit_log
// row on the caller's client, so it commits or rolls back with the action it records:
// an audit failure throws and aborts that action (D2A §4 COMP-015).
//
// - Only the contract and TASK-015 action codes (actions.ts) are accepted.
// - `details` uses the strict officer allowlist plus server-only subject UUIDs.
//   These storage keys never expand the frozen API-013 role projections.
//   There is no free-text key, so names, phones, notes, reasons, places and provider
//   payloads cannot be written. Unknown keys are refused, not dropped.
// - The actor comes from a server-derived Principal (actorFor) or SYSTEM_ACTOR, never
//   from client input. `at` is the database clock (no column grant for it).
// - Errors carry no values: AuditWriteError names the rule that failed, nothing else.
import type { z } from "zod";
import { isUuid, officerAuditEntryViewSchema, uuidSchema, type ActorType } from "@/contracts";
import { effectiveRole, type Principal } from "@/contracts/server";
import { ACTION_ACTORS, isWritableAuditAction, type CaseAuditAction } from "./actions";
import type { Queryable } from "@/server/db/queryable";
import { col, firstRow } from "@/server/db/decode";

export const auditDetailsSchema = officerAuditEntryViewSchema.shape.details.extend({
  target_user_id: uuidSchema.optional(),
  duplicate_link_id: uuidSchema.optional(),
});
export type AuditDetails = z.input<typeof auditDetailsSchema>;

declare const actorBrand: unique symbol;
// Built only by actorFor() or SYSTEM_ACTOR, so an actor cannot come from a request body.
export type AuditActor = Readonly<{
  type: ActorType;
  userId: string | null;
  sessionId: string | null;
  [actorBrand]: true;
}>;

const brand = (a: { type: ActorType; userId: string | null; sessionId: string | null }) => Object.freeze(a) as AuditActor;

// Automatic pipeline steps (submitted → open, queue-state reconciliation by the matcher).
export const SYSTEM_ACTOR: AuditActor = brand({ type: "system", userId: null, sessionId: null });

export class AuditWriteError extends Error {
  constructor(readonly rule: "action" | "actor" | "details" | "ids" | "insert") {
    super(`audit write refused: ${rule}`);
    this.name = "AuditWriteError";
  }
}

// The audited role is the *effective* role (BR-024): an unverified officer acts as staff.
// Inactive or malformed principals have no actor and cannot be audited as acting.
export function actorFor(p: Principal): AuditActor {
  const role = effectiveRole(p);
  if (role === null) throw new AuditWriteError("actor");
  if (p.kind === "parent") return brand({ type: "parent", userId: null, sessionId: p.sessionId });
  return brand({ type: role, userId: p.userId, sessionId: null });
}

export type AuditEntry = {
  action: CaseAuditAction;
  caseId?: string | null;
  candidateId?: string | null;
  details?: AuditDetails;
  requestId?: string | null;
};


const optionalId = (v: string | null | undefined): string | null => {
  if (v === undefined || v === null) return null;
  if (!isUuid(v)) throw new AuditWriteError("ids");
  return v.toLowerCase();
};

// Request IDs are server-generated UUIDs; anything else is not stored.
const requestIdOf = (v: string | null | undefined) => (typeof v === "string" && isUuid(v) ? v.toLowerCase() : null);

export function checkAuditEntry(actor: AuditActor, entry: AuditEntry) {
  if (!isWritableAuditAction(entry.action)) throw new AuditWriteError("action");
  const actorOk =
    (actor.type === "parent" && isUuid(actor.sessionId) && actor.userId === null) ||
    (actor.type === "system" && actor.userId === null && actor.sessionId === null) ||
    (["staff", "officer", "admin"].includes(actor.type) && isUuid(actor.userId) && actor.sessionId === null);
  if (!actorOk || !ACTION_ACTORS[entry.action].includes(actor.type)) throw new AuditWriteError("actor");
  const parsed = auditDetailsSchema.safeParse(entry.details ?? {});
  if (!parsed.success) throw new AuditWriteError("details");
  return {
    caseId: optionalId(entry.caseId),
    candidateId: optionalId(entry.candidateId),
    details: parsed.data,
    requestId: requestIdOf(entry.requestId),
  };
}

// Returns the new audit_log id. Runs on the caller's transaction client.
export async function appendAudit(client: Queryable, actor: AuditActor, entry: AuditEntry): Promise<number> {
  const safe = checkAuditEntry(actor, entry);
  const { rows } = await client.query(
    `INSERT INTO audit_log (actor_type, actor_user_id, actor_session_id, action, case_id, candidate_id, details, request_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8) RETURNING id`,
    [actor.type, actor.userId, actor.sessionId, entry.action, safe.caseId, safe.candidateId, JSON.stringify(safe.details), safe.requestId],
  );
  const row = firstRow("audit_log", rows);
  const id = row ? col.numeric("audit_log", row, "id") : Number.NaN;
  if (!Number.isSafeInteger(id) || id < 1) throw new AuditWriteError("insert");
  return id;
}
