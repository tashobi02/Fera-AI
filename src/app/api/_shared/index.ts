// Shared API layer (TASK-007, COMP-004/021). Owner: Mahim. Route handlers under
// src/app/api/** import `defineRoute` from here.
import { createRouteFactory } from "./compose";

export { ApiError, errorResponse, jsonResponse } from "./envelope";
export { RATE_LIMITS, RateLimiter, MemoryRateLimitStore, createKeyer } from "./limit";
export type { RateLimitRule, RateLimitStore, LimitDecision } from "./limit";
export { createLogger } from "./log";
export { readJsonBody, parseQuery, parseParams, parseWith, requestIdFrom, clientAddress, isSameOrigin } from "./request";
export { Reply, createRouteFactory } from "./compose";
export type { PrincipalResolver, RouteSpec, RouteHandler, RouteContext } from "./compose";

// No session resolver exists yet, so every non-public route answers E-002 (fail
// closed). TASK-006 replaces this with the Auth.js and parent-cookie resolver,
// which must also create the parent session on the first intake call (D2A §9.1).
export const defineRoute = createRouteFactory({ resolvePrincipal: async () => null });
