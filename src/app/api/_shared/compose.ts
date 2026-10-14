// Route composer (COMP-004; AGENTS "Zod input → role guard → per-role DTO allowlist →
// error envelope"). Order per request:
//   request ID → same-origin (state changes) → principal + D2A §9.2 role guard →
//   rate limits → Zod params/query/body → `authorize` (input-dependent guard such as
//   canIntake) → handler → response schema (fail closed) → envelope, no-store, log.
// Handlers return a DTO; it is parsed with the declared response schema, so a raw row
// or an extra key becomes E-021 instead of a response.
import type { z } from "zod";
import { API_ACCESS, canCall, effectiveRole, type ApiId, type EffectiveRole, type Principal } from "@/contracts/server";
import { ApiError, errorResponse, jsonResponse } from "./envelope";
import { createKeyer, RateLimiter, MemoryRateLimitStore, type Keyer, type RateLimitRule } from "./limit";
import { createLogger, levelFor, type Logger } from "./log";
import { SAFE_METHODS, clientAddress, isSameOrigin, parseParams, parseQuery, readJsonBody, requestIdFrom } from "./request";

export type RouteContext = { params: Promise<Record<string, string | string[] | undefined>> };
export type RouteHandler = (req: Request, ctx: RouteContext) => Promise<Response>;

// Builds a Principal from database rows (TASK-006). It may throw ApiError("E-019") for
// an expired parent draft session; any other throw becomes E-021.
export type PrincipalResolver = (req: Request) => Promise<Principal | null>;

type Out<S> = S extends z.ZodType ? z.output<S> : undefined;

export class Reply<T> {
  constructor(
    readonly data: T,
    readonly status: 200 | 201 | 202 = 200,
  ) {}
}

export type HandlerInput<P, Q, B> = {
  req: Request;
  requestId: string;
  principal: Principal | null;
  role: EffectiveRole | null;
  params: P;
  query: Q;
  body: B;
};

export type RouteSpec<
  P extends z.ZodType | undefined,
  Q extends z.ZodType | undefined,
  B extends z.ZodType | undefined,
  R extends z.ZodType,
> = {
  api: ApiId;
  params?: P;
  query?: Q;
  body?: B;
  response: R;
  status?: 200 | 201 | 202;
  rateLimit?: readonly RateLimitRule[];
  authorize?: (principal: Principal | null, input: { params: Out<P>; query: Out<Q>; body: Out<B> }) => boolean;
  handler: (input: HandlerInput<Out<P>, Out<Q>, Out<B>>) => Promise<z.input<R> | Reply<z.input<R>>>;
};

export type RouteDeps = {
  resolvePrincipal: PrincipalResolver;
  limiter?: RateLimiter;
  keyer?: Keyer;
  logger?: Logger;
  now?: () => number;
};

export function createRouteFactory(deps: RouteDeps) {
  const limiter = deps.limiter ?? new RateLimiter(new MemoryRateLimitStore());
  const keyer = deps.keyer ?? createKeyer();
  const logger = deps.logger ?? createLogger();
  const now = deps.now ?? Date.now;

  return function defineRoute<
    P extends z.ZodType | undefined = undefined,
    Q extends z.ZodType | undefined = undefined,
    B extends z.ZodType | undefined = undefined,
    R extends z.ZodType = z.ZodType,
  >(spec: RouteSpec<P, Q, B, R>): RouteHandler {
    const isPublic = API_ACCESS[spec.api].includes("public");

    return async (req, ctx) => {
      const started = now();
      const requestId = requestIdFrom(req);
      const base = { request_id: requestId, route: spec.api, method: req.method };
      let principal: Principal | null = null;
      let res: Response;
      let errorId: ApiError["id"] | undefined;

      try {
        if (!SAFE_METHODS.has(req.method) && !isSameOrigin(req)) throw new ApiError("E-003");

        if (!isPublic) {
          principal = await deps.resolvePrincipal(req);
          if (!canCall(spec.api, principal)) throw new ApiError(effectiveRole(principal) === null ? "E-002" : "E-003");
        }

        for (const rule of spec.rateLimit ?? []) {
          const subject =
            rule.scope === "principal" && principal ? keyer.principal(principal) : keyer.network(clientAddress(req));
          const decision = await limiter.hit(rule, subject);
          if (decision.ok) {
            if (decision.degraded) logger.warn({ ...base, event: "ratelimit.degraded", rule: rule.id });
            continue;
          }
          if (decision.reason === "limited") {
            logger.warn({ ...base, event: "ratelimit.limited", rule: rule.id, error_id: "E-007" });
            throw new ApiError("E-007", { seconds: decision.retryAfterSeconds });
          }
          logger.error({ ...base, event: "ratelimit.unavailable", rule: rule.id, error_id: "E-021" });
          throw new ApiError("E-021");
        }

        const params = (spec.params ? await parseParams(ctx?.params, spec.params) : undefined) as Out<P>;
        const query = (spec.query ? parseQuery(req, spec.query) : undefined) as Out<Q>;
        const body = (spec.body ? await readJsonBody(req, spec.body) : undefined) as Out<B>;

        if (spec.authorize && !spec.authorize(principal, { params, query, body })) throw new ApiError("E-003");

        const result = await spec.handler({ req, requestId, principal, role: effectiveRole(principal), params, query, body });
        const reply = result instanceof Reply ? result : new Reply(result, spec.status ?? 200);
        const parsed = spec.response.safeParse(reply.data);
        if (!parsed.success) {
          logger.error({ ...base, event: "response.invalid", error_id: "E-021" });
          throw new ApiError("E-021");
        }
        res = jsonResponse(requestId, reply.status, parsed.data);
      } catch (err) {
        if (!(err instanceof ApiError)) {
          logger.error({ ...base, event: "handler.threw", error_id: "E-021", err_name: err instanceof Error ? err.name : undefined });
        }
        const apiError = err instanceof ApiError ? err : new ApiError("E-021");
        errorId = apiError.id;
        res = errorResponse(requestId, apiError);
        // errorResponse may have fallen back to E-021.
        if (res.status === 500) errorId = "E-021";
      }

      logger[levelFor(res.status, errorId)]({
        ...base,
        event: "request",
        role: effectiveRole(principal) ?? "anonymous",
        status: res.status,
        duration_ms: now() - started,
        error_id: errorId,
      });
      return res;
    };
  };
}

export type DefineRoute = ReturnType<typeof createRouteFactory>;
