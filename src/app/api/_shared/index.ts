// Shared API layer (TASK-007, COMP-004/021). Owner: Mahim. Route handlers under
// src/app/api/** import `defineRoute` from here.
//
// Usage notes for route owners:
// - Annotate the handler's return type as the DTO type (`async (): Promise<OfficerCaseView> => …`)
//   so literal fields type-check; the response schema still validates it at runtime.
// - Segment config must be literal exports in each route.ts (Next reads them
//   statically): `export const runtime = "nodejs"` where needed, and AI routes
//   (API-001/002) need `export const maxDuration` above the 25 s provider timeout.
// - Throw `new ApiError("E-004", { caseId })` for a hidden or absent record; the layer
//   writes the access.denied audit, so handlers must not write it again.
// - Next's own 404/405 responses (unknown path, unexported method) are not enveloped.
import { createLogger } from "./log";
import { defaultAuth } from "@/server/auth/default";
import { auditAccessDenied } from "@/server/audit/denied";
import { createRouteFactory, type PrincipalResolver } from "./compose";

export { ApiError, ERROR_REASONS, errorResponse, jsonResponse } from "./envelope";
export type { ApiErrorParams, ErrorReason, ErrorResult } from "./envelope";
export { CookieJar, isProductionEnv, secureCookiesFor } from "./cookies";
export type { CookieOptions } from "./cookies";
export { RATE_LIMITS, RateLimiter, MemoryRateLimitStore, createKeyer, hasPaidLimits } from "./limit";
export type { RateLimitRule, RateLimitStore, LimitDecision } from "./limit";
export { createLogger, describeError, levelFor } from "./log";
export type { Logger, LogEntry, LogEvent, LogStage } from "./log";
export {
  readJsonBody,
  readMultipart,
  readCapped,
  parseQuery,
  parseParams,
  parseWith,
  newRequestId,
  clientRequestId,
  clientAddress,
  normaliseAddress,
  isSameOrigin,
  trustProxyFromEnv,
} from "./request";
export { PUBLIC_APIS, RECORD_ROUTES, Reply, createRouteFactory, isStrictResponseSchema } from "./compose";
export type {
  AuditDenied,
  AuditDeniedInput,
  DefineRoute,
  HandlerInput,
  PrincipalResolver,
  ResolverInput,
  RouteDeps,
  RouteHandler,
  RouteHandlerContext,
  RouteSpec,
} from "./compose";

const logger = createLogger();
let stubWarned = false;

// Null resolver kept for tests and tools that build a factory without a database: no
// principal, so every non-public route answers E-002 (fail closed), and the first call
// logs auth.resolver_stub at error.
export const stubResolver: PrincipalResolver = async () => {
  if (!stubWarned) {
    stubWarned = true;
    logger.error({ event: "auth.resolver_stub" });
  }
  return null;
};

// TASK-006: principals come from the database on every request (src/server/auth). The
// parent session is minted only on API-001/002 (D2A §9.1). TASK-015: every signed-in
// E-003/E-004 denial writes one access.denied row (src/server/audit/denied.ts); if that
// write fails the request still fails closed with E-021.
const resolvePrincipal: PrincipalResolver = (input) => defaultAuth().resolvePrincipal(input);

export const defineRoute = createRouteFactory({ resolvePrincipal, auditDenied: auditAccessDenied, logger });
