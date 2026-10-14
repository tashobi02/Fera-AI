// Route composer (COMP-004). Order per request:
//   request ID → same-origin (state changes) → pre-auth network limit → principal +
//   D2A §9.2 role guard → route rate limits → Zod params/query/body → `authorize`
//   (input-dependent guard such as canIntake) → handler → per-role response schema
//   (fail closed) → envelope, cookies, no-store, log.
// The coarse role guard runs before Zod so unauthenticated callers never see
// validation behaviour; AGENTS' "Zod input → role guard" wording needs a docs PR.
// Handlers return a DTO; it is parsed with the role's response schema and only the
// parsed output is sent, so a raw row or an extra key becomes E-021.
import type { z } from "zod";
import { LIMITS } from "@/contracts";
import { API_ACCESS, canCall, effectiveRole, type ApiId, type EffectiveRole, type Principal } from "@/contracts/server";
import { CookieJar, isProductionEnv, secureCookiesFor } from "./cookies";
import { ApiError, PROTECTED_HEADERS, errorResponse, jsonResponse, type ErrorReason, type ErrorResult } from "./envelope";
import { MemoryRateLimitStore, RATE_LIMITS, RateLimiter, createKeyer, hasPaidLimits, type Keyer, type RateLimitRule } from "./limit";
import { createLogger, describeError, issueTokens, levelFor, type LogStage, type Logger } from "./log";
import {
  SAFE_METHODS,
  clientAddress,
  clientRequestId,
  isSameOrigin,
  newRequestId,
  parseParams,
  parseQuery,
  readJsonBody,
  trustProxyFromEnv,
} from "./request";

// Public per D2A §9.2: handlers of every other API always receive a principal.
export const PUBLIC_APIS = ["API-019", "API-020"] as const satisfies readonly ApiId[];
type PublicApiId = (typeof PUBLIC_APIS)[number];

// Record routes (`:id`/`:caseId` in D2A §5.5): missing and forbidden are the same E-004
// (API-004/009 "indistinguishable", D6 TC-022/052, D2B E-004).
export const RECORD_ROUTES = [
  "API-004", "API-005", "API-006", "API-009", "API-010", "API-011", "API-013", "API-014", "API-023",
] as const satisfies readonly ApiId[];

export type PrincipalFor<A extends ApiId> = A extends PublicApiId ? Principal | null : Principal;
export type RoleFor<A extends ApiId> = A extends PublicApiId ? EffectiveRole | null : EffectiveRole;

export type RouteHandlerContext = { params: Promise<Record<string, string | string[] | undefined>> };
export type RouteHandler = (req: Request, ctx: RouteHandlerContext) => Promise<Response>;

export type ResolverInput = { req: Request; api: ApiId; cookies: CookieJar };
// Builds a Principal from database rows (TASK-006). It may mint the parent session
// through `cookies` (API-001/002 only), and may throw ApiError("E-019") for an expired
// parent session; any other throw becomes E-021.
export type PrincipalResolver = (input: ResolverInput) => Promise<Principal | null>;

export type AuditDeniedInput = {
  principal: Principal;
  api: ApiId;
  requestId: string;
  errorId: "E-003" | "E-004";
  reason: ErrorReason;
  caseId: string | null; // null when the record is absent or unknown (BR-010, TC-052)
};
// Writes the `access.denied` audit row (TASK-015). A throw fails the request closed.
export type AuditDenied = (input: AuditDeniedInput) => Promise<void>;

export type ResponseSpec = z.ZodType | Partial<Record<EffectiveRole, z.ZodType>>;
export type ResponseInput<R> = R extends z.ZodType
  ? z.input<R>
  : { [K in keyof R]: R[K] extends z.ZodType ? z.input<R[K]> : never }[keyof R];

type Out<S> = S extends z.ZodType ? z.output<S> : undefined;

export class Reply<T> {
  constructor(
    readonly data: T,
    readonly status: 200 | 201 | 202 = 200,
    readonly headers: Readonly<Record<string, string>> = {},
  ) {}
}

export type HandlerInput<A extends ApiId, P, Q, B> = {
  req: Request;
  requestId: string;
  api: A;
  principal: PrincipalFor<A>;
  role: RoleFor<A>;
  params: P;
  query: Q;
  body: B;
  cookies: CookieJar;
};

export type RouteSpec<
  A extends ApiId,
  P extends z.ZodType | undefined,
  Q extends z.ZodType | undefined,
  B extends z.ZodType | undefined,
  R extends ResponseSpec,
> = {
  api: A;
  params?: P;
  query?: Q;
  body?: B;
  maxBodyBytes?: number; // default LIMITS.jsonBodyBytes; API-015 uses LIMITS.importBodyBytes
  // One strict schema, or one per effective role (missing role → E-021).
  response: R;
  status?: 200 | 201 | 202;
  rateLimit?: readonly RateLimitRule[];
  // Paid AI route (BR-023): must carry aiPrincipal + aiNetwork; limiter down → E-013.
  paid?: boolean;
  // Denial for a signed-in caller; record routes are always E-004.
  deny?: "E-003" | "E-004";
  authorize?: (principal: PrincipalFor<A>, input: { params: Out<P>; query: Out<Q>; body: Out<B> }) => boolean;
  handler: (input: HandlerInput<A, Out<P>, Out<Q>, Out<B>>) => Promise<ResponseInput<R> | Reply<ResponseInput<R>>>;
};

export type RouteDeps = {
  resolvePrincipal: PrincipalResolver;
  auditDenied?: AuditDenied;
  limiter?: RateLimiter;
  keyer?: Keyer;
  logger?: Logger;
  now?: () => number;
  trustProxy?: boolean;
  preAuthLimit?: RateLimitRule | null;
  production?: boolean;
  secureCookies?: boolean;
};

class AuditUnavailableError extends Error {
  constructor() {
    super("audit unavailable");
    this.name = "AuditUnavailableError";
  }
}
const auditUnavailable: AuditDenied = async () => {
  throw new AuditUnavailableError();
};

type ZodDef = { type: string; catchall?: { _zod: { def: ZodDef } }; options?: z.ZodType[] };
const defOf = (s: z.ZodType) => (s as unknown as { _zod: { def: ZodDef } })._zod.def;

// A response schema must reject unknown keys: a strict object, or a union of them.
export function isStrictResponseSchema(schema: z.ZodType): boolean {
  const def = defOf(schema);
  if (def.type === "object") return def.catchall?._zod.def.type === "never";
  if (def.type === "union") return (def.options ?? []).length > 0 && def.options!.every(isStrictResponseSchema);
  return false;
}

function responseSchemas(api: ApiId, response: ResponseSpec): { single?: z.ZodType; byRole?: Partial<Record<EffectiveRole, z.ZodType>> } {
  const isSchema = typeof (response as z.ZodType).safeParseAsync === "function";
  const list = isSchema ? [response as z.ZodType] : Object.values(response as Record<string, z.ZodType>);
  if (list.length === 0 || !list.every(isStrictResponseSchema)) {
    throw new Error(`${api}: response schemas must be strict objects or unions of strict objects`);
  }
  return isSchema ? { single: response as z.ZodType } : { byRole: response as Partial<Record<EffectiveRole, z.ZodType>> };
}

export function createRouteFactory(deps: RouteDeps) {
  const limiter = deps.limiter ?? new RateLimiter(new MemoryRateLimitStore());
  const keyer = deps.keyer ?? createKeyer();
  const logger = deps.logger ?? createLogger();
  const now = deps.now ?? Date.now;
  const auditDenied = deps.auditDenied ?? auditUnavailable;
  const trustProxy = deps.trustProxy ?? trustProxyFromEnv();
  const preAuthLimit = deps.preAuthLimit === undefined ? RATE_LIMITS.preAuthNetwork : deps.preAuthLimit;
  const production = deps.production ?? isProductionEnv();
  const secureCookies = deps.secureCookies ?? secureCookiesFor(production);
  let memoryStoreWarned = false;
  let noProxyWarned = false;

  return function defineRoute<
    A extends ApiId,
    P extends z.ZodType | undefined = undefined,
    Q extends z.ZodType | undefined = undefined,
    B extends z.ZodType | undefined = undefined,
    R extends ResponseSpec = z.ZodType,
  >(spec: RouteSpec<A, P, Q, B, R>): RouteHandler {
    // Module-load checks: a misconfigured route fails the build, not a request.
    const schemas = responseSchemas(spec.api, spec.response);
    const isRecordRoute = (RECORD_ROUTES as readonly ApiId[]).includes(spec.api);
    if (isRecordRoute && spec.deny === "E-003") throw new Error(`${spec.api}: record routes deny with E-004`);
    if (spec.paid && !hasPaidLimits(spec.rateLimit)) throw new Error(`${spec.api}: paid routes need aiPrincipal and aiNetwork limits that fail closed`);
    const denyId = isRecordRoute ? "E-004" : (spec.deny ?? "E-003");
    const isPublic = API_ACCESS[spec.api].includes("public");
    const maxBodyBytes = spec.maxBodyBytes ?? LIMITS.jsonBodyBytes;

    return async (req, ctx) => {
      const started = now();
      const requestId = newRequestId();
      const base = { request_id: requestId, client_request_id: clientRequestId(req), route: spec.api, method: req.method };
      const cookies = new CookieJar(secureCookies);
      let principal: Principal | null = null;
      let stage: LogStage = "origin";
      let guardDenial = false;
      let result: ErrorResult | undefined;
      let reason: ErrorReason | undefined;
      let response: Response;

      if (production && limiter.usesMemoryStore && !memoryStoreWarned) {
        memoryStoreWarned = true;
        logger.error({ event: "ratelimit.memory_store" });
      }

      const networkSubject = () => {
        const address = clientAddress(req, trustProxy);
        if (address === null) {
          if (trustProxy) logger.warn({ ...base, event: "ratelimit.unknown_address" });
          else if (!noProxyWarned) {
            noProxyWarned = true;
            logger.warn({ event: "ratelimit.unknown_address", reason: "ratelimit" });
          }
        }
        return keyer.network(address);
      };

      const enforce = async (rule: RateLimitRule) => {
        const subject = rule.scope === "principal" && principal ? keyer.principal(principal) : networkSubject();
        const decision = await limiter.hit(rule, subject);
        if (decision.ok) {
          if (decision.degraded) logger.warn({ ...base, event: "ratelimit.degraded", rule: rule.id });
          return;
        }
        if (decision.reason === "limited") {
          logger.warn({ ...base, event: "ratelimit.limited", rule: rule.id, error_id: "E-007" });
          throw new ApiError("E-007", { seconds: decision.retryAfterSeconds, reason: "ratelimit" });
        }
        const id = spec.paid ? "E-013" : "E-021"; // E-013 keeps the manual form usable (BR-023)
        logger.error({ ...base, event: "ratelimit.unavailable", rule: rule.id, error_id: id });
        throw new ApiError(id, { reason: "ratelimit" });
      };

      const deny = (why: ErrorReason) => {
        guardDenial = true;
        return new ApiError(denyId, { reason: why });
      };

      try {
        if (!SAFE_METHODS.has(req.method) && !isSameOrigin(req)) throw new ApiError("E-003", { reason: "origin" });

        stage = "limiter";
        if (preAuthLimit) await enforce(preAuthLimit);

        if (!isPublic) {
          stage = "resolver";
          principal = await deps.resolvePrincipal({ req, api: spec.api, cookies });
          if (principal !== null && effectiveRole(principal) === null) logger.warn({ ...base, event: "auth.principal_invalid" });
          if (effectiveRole(principal) === null) throw new ApiError("E-002", { reason: "role" });
          if (!canCall(spec.api, principal)) throw deny("role");
        }
        const role = effectiveRole(principal);

        stage = "limiter";
        for (const rule of spec.rateLimit ?? []) await enforce(rule);

        stage = "input";
        const params = (spec.params ? await parseParams(ctx?.params, spec.params) : undefined) as Out<P>;
        const query = (spec.query ? await parseQuery(req, spec.query) : undefined) as Out<Q>;
        const body = (spec.body ? await readJsonBody(req, spec.body, maxBodyBytes) : undefined) as Out<B>;

        stage = "authorize";
        if (spec.authorize && !spec.authorize(principal as PrincipalFor<A>, { params, query, body })) throw deny("authorize");

        stage = "handler";
        const out = await spec.handler({
          req,
          requestId,
          api: spec.api,
          principal: principal as PrincipalFor<A>,
          role: role as RoleFor<A>,
          params,
          query,
          body,
          cookies,
        });

        stage = "response";
        const reply = out instanceof Reply ? out : new Reply(out, spec.status ?? 200);
        const schema = schemas.single ?? (role ? schemas.byRole?.[role] : undefined);
        if (!schema) {
          logger.error({ ...base, event: "response.invalid", stage, error_id: "E-021" });
          throw new ApiError("E-021", { reason: "response" });
        }
        const parsed = await schema.safeParseAsync(reply.data);
        if (!parsed.success) {
          logger.error({ ...base, event: "response.invalid", stage, error_id: "E-021", issues: issueTokens(parsed.error.issues) });
          throw new ApiError("E-021", { reason: "response" });
        }
        response = jsonResponse(requestId, reply.status, parsed.data);
        for (const [name, value] of Object.entries(reply.headers)) {
          if (!PROTECTED_HEADERS.has(name.toLowerCase())) response.headers.set(name, value);
        }
      } catch (err) {
        let apiError: ApiError;
        if (err instanceof ApiError) {
          apiError = err;
        } else {
          logger.error({ ...base, event: "handler.threw", stage, error_id: "E-021", ...describeError(err) });
          apiError = new ApiError("E-021", { reason: stage === "resolver" ? "resolver" : undefined });
        }

        // Every signed-in guard denial and every E-004 writes access.denied (BR-010).
        if (principal && effectiveRole(principal) !== null && (guardDenial || apiError.id === "E-004")) {
          try {
            await auditDenied({
              principal,
              api: spec.api,
              requestId,
              errorId: apiError.id === "E-004" ? "E-004" : "E-003",
              reason: apiError.reason ?? "authorize",
              caseId: apiError.caseId ?? null,
            });
          } catch (auditErr) {
            logger.error({ ...base, event: "audit.unavailable", stage: "audit", error_id: "E-021", original_error_id: apiError.id, ...describeError(auditErr) });
            stage = "audit";
            apiError = new ApiError("E-021", { reason: "audit" });
          }
        }

        result = errorResponse(requestId, apiError);
        if (result.fallbackFrom) {
          logger.error({ ...base, event: "envelope.fallback", stage, error_id: "E-021", original_error_id: result.fallbackFrom });
        }
        reason = apiError.reason;
        response = result.response;
      }

      cookies.applyTo(response.headers);

      logger[levelFor(response.status, result?.id)]({
        ...base,
        event: "request",
        role: effectiveRole(principal) ?? "anonymous",
        status: response.status,
        duration_ms: now() - started,
        error_id: result?.id,
        reason,
        stage: result ? stage : undefined,
      });
      return response;
    };
  };
}

export type DefineRoute = ReturnType<typeof createRouteFactory>;
