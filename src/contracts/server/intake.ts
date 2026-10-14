// Server-only intake and auth helpers.
import { z } from "zod";
import { LIMITS, isoDateTimeSchema, sha256HexSchema, uuidSchema, versionSchema } from "../primitives";
import { signInRequestSchema, type SignInRequest } from "../schemas";
import { caseKindSchema } from "../states";

// Pre-submit server state is metadata only (BR-004/023, TC-060). Never a response:
// it lives in the server barrel so no client code can render it.
export const intakeDraftMetadataSchema = z
  .strictObject({
    id: uuidSchema,
    session_id: uuidSchema.nullable(),
    user_id: uuidSchema.nullable(),
    kind: caseKindSchema,
    created_at: isoDateTimeSchema,
    expires_at: isoDateTimeSchema,
    payload_hash: sha256HexSchema.nullable(),
    ai_calls_used: z.int().min(0).max(LIMITS.aiCallsPerDraft),
    revision: versionSchema,
  })
  .superRefine((d, ctx) => {
    if ((d.session_id === null) === (d.user_id === null)) {
      ctx.addIssue({ code: "custom", message: "exactly one of session_id or user_id", path: ["session_id"] });
    }
    if (Date.parse(d.expires_at) <= Date.parse(d.created_at)) {
      ctx.addIssue({ code: "custom", message: "expires_at must be after created_at", path: ["expires_at"] });
    }
  });
export type IntakeDraftMetadata = z.infer<typeof intakeDraftMetadataSchema>;

// API-020: every failure, including a malformed username, is the generic E-002 so the
// response never reveals which part was wrong. The caller still applies E-007 limits.
export function parseSignInRequest(body: unknown): { ok: true; data: SignInRequest } | { ok: false; errorId: "E-002" } {
  const parsed = signInRequestSchema.safeParse(body);
  return parsed.success ? { ok: true, data: parsed.data } : { ok: false, errorId: "E-002" };
}
