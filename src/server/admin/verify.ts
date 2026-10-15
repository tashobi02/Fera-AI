// API-017 verify officer [MOCK] (TASK-032; D2A API-017, FR-035, BR-024, STORY-016).
// Owner: Mahim.
//
// [MOCK] seeded authority: this sets users.verified on a seeded synthetic account. It
// is not real-world onboarding or identity verification, which stays a pilot gate
// (D2A API-017 Rules). The UI labels every use [MOCK].
//
// One transaction (withTransaction, fera_app pool):
//   1. the caller must be an active admin: checked on the Principal, then re-read and
//      share-locked in the transaction (an admin deactivated mid-request is E-003);
//   2. the target row is locked FOR UPDATE; an unknown ID or a non-officer target
//      (staff, admin) is E-004, so the route never confirms which accounts exist;
//   3. when the flag changes: UPDATE users SET verified, and one audit row
//      `user.verification_changed` (actor admin; details { api, verified, target_role })
//      in the same transaction, so the change and its audit commit or fail together.
//      Setting the value it already has writes nothing and returns the current state.
//
// A decision (API-010) share-locks the officer row, so an un-verify waits for an
// in-flight decision to finish, and a later decision sees the new flag (BR-024).
// fera_app holds UPDATE (verified) on users only (db/roles.sql).
import { ApiError } from "@/app/api/_shared/envelope";
import { isUuid, verifyUserRequestSchema, verifyUserResponseSchema, type VerifyUserRequestInput, type VerifyUserResponse } from "@/contracts";
import { effectiveRole, type Principal } from "@/contracts/server";
import { CASE_AUDIT_ACTIONS, actorFor, appendAudit } from "@/server/audit";
import { withTransaction, type Connectable } from "@/server/case/internal";
import { col, firstRow } from "@/server/db/decode";

export type AdminWriteContext = { requestId?: string | null; pool?: Connectable; attempts?: number };

export async function setOfficerVerified(
  principal: Principal,
  userId: string,
  input: VerifyUserRequestInput,
  ctx: AdminWriteContext = {},
): Promise<VerifyUserResponse> {
  if (principal.kind !== "user" || effectiveRole(principal) !== "admin") throw new ApiError("E-003", { reason: "authorize" });
  const request = verifyUserRequestSchema.parse(input);
  if (!isUuid(userId)) throw new ApiError("E-004");
  const targetId = userId.toLowerCase();
  const actor = actorFor(principal);

  return withTransaction(async (client) => {
    const admin = await client.query("SELECT id FROM users WHERE id = $1 AND role = 'admin' AND is_active FOR SHARE", [principal.userId]);
    if (admin.rows.length !== 1) throw new ApiError("E-003", { reason: "authorize" });

    const target = firstRow("users", (await client.query("SELECT id, role::text AS role, verified FROM users WHERE id = $1 FOR UPDATE", [targetId])).rows);
    if (!target || col.text("users", target, "role") !== "officer") throw new ApiError("E-004");
    const id = col.uuid("users", target, "id");

    if (col.bool("users", target, "verified") !== request.verified) {
      await client.query("UPDATE users SET verified = $2 WHERE id = $1", [id, request.verified]);
      await appendAudit(client, actor, {
        action: CASE_AUDIT_ACTIONS.userVerificationChanged,
        details: { api: "API-017", verified: request.verified, target_role: "officer" },
        requestId: ctx.requestId,
      });
    }
    return verifyUserResponseSchema.parse({ id, role: "officer", verified: request.verified });
  }, { pool: ctx.pool, attempts: ctx.attempts });
}
