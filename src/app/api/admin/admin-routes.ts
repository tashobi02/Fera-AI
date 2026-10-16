// SCREEN-013 admin routes (TASK-032, COMP-043; D2A API-016, API-017, API-021). Each
// builder takes the route factory and its service, so tests run the real pipeline
// (origin → role guard → limits → Zod → handler → strict response) with fakes; the
// route.ts files bind them to the default factory and services.
//
// - API-016 POST /api/admin/anonymise (legacy name): payload redaction, not legal
//   anonymisation. Body is AnonymiseRequest (exactly one of case_ids / all_eligible and the
//   typed "বেনামী"); anything else is E-001. RedactionForbiddenError → E-003 (the layer
//   writes access.denied). RedactionDbError → E-021 after one db.refusal log line with the
//   SQLSTATE only; cases committed before the failure stay redacted (OD-062-4).
// - API-017 POST /api/admin/users/:id/verify [MOCK]: E-001 bad ID or body, E-003 not an
//   active admin, E-004 unknown or non-officer target.
// - API-021 GET /api/admin/users: AdminUsersResponse only (no hashes, sessions or child data).
import { z } from "zod";
import {
  adminUsersResponseSchema,
  anonymiseRequestSchema,
  anonymiseResponseSchema,
  pageQuerySchema,
  uuidSchema,
  verifyUserRequestSchema,
  verifyUserResponseSchema,
  type AdminUsersResponse,
  type AnonymiseResponse,
  type VerifyUserResponse,
} from "@/contracts";
import {
  RedactionDbError,
  RedactionForbiddenError,
  getRedactorPool,
  listAdminUsers,
  redactCases,
  setOfficerVerified,
} from "@/server/admin";
import { ApiError, RATE_LIMITS, createLogger, type DefineRoute, type Logger } from "../_shared";

export type RedactService = (principal: Parameters<typeof redactCases>[1], body: Parameters<typeof redactCases>[2]) => Promise<AnonymiseResponse>;
export type VerifyService = typeof setOfficerVerified;
export type ListUsersService = typeof listAdminUsers;

const defaultRedact: RedactService = (principal, body) => redactCases(getRedactorPool(), principal, body);

export function anonymiseRoute(defineRoute: DefineRoute, redact: RedactService = defaultRedact, logger: Logger = createLogger()) {
  return defineRoute({
    api: "API-016",
    body: anonymiseRequestSchema,
    response: anonymiseResponseSchema,
    rateLimit: [RATE_LIMITS.adminRedaction],
    handler: async ({ principal, body, requestId }): Promise<AnonymiseResponse> => {
      try {
        return await redact(principal, body);
      } catch (err) {
        if (err instanceof RedactionForbiddenError) throw new ApiError("E-003", { reason: "authorize" });
        if (err instanceof RedactionDbError) {
          logger.error({
            event: "db.refusal",
            request_id: requestId,
            route: "API-016",
            stage: "handler",
            error_id: "E-021",
            err_name: "RedactionDbError",
            err_code: err.sqlstate ?? undefined,
          });
          throw new ApiError("E-021");
        }
        throw err;
      }
    },
  });
}

const verifyParamsSchema = z.object({ id: uuidSchema });

export function verifyRoute(defineRoute: DefineRoute, verify: VerifyService = setOfficerVerified) {
  return defineRoute({
    api: "API-017",
    params: verifyParamsSchema,
    body: verifyUserRequestSchema,
    response: verifyUserResponseSchema,
    rateLimit: [RATE_LIMITS.adminVerify],
    handler: async ({ principal, params, body, requestId }): Promise<VerifyUserResponse> =>
      verify(principal, params.id, body, { requestId }),
  });
}

export function usersRoute(defineRoute: DefineRoute, list: ListUsersService = listAdminUsers) {
  return defineRoute({
    api: "API-021",
    query: pageQuerySchema,
    response: adminUsersResponseSchema,
    handler: async ({ principal, query }): Promise<AdminUsersResponse> => list(principal, query),
  });
}
