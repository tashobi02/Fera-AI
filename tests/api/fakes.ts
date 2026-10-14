// Test fakes for the shared API layer: a fixed principal resolver, a recording audit
// hook and a captured log sink.
import type { Principal } from "@/contracts/server";
import {
  createKeyer,
  createLogger,
  createRouteFactory,
  MemoryRateLimitStore,
  RateLimiter,
  type AuditDenied,
  type AuditDeniedInput,
  type PrincipalResolver,
  type RateLimitRule,
  type RouteDeps,
} from "@/app/api/_shared";

export const fakeResolver =
  (principal: Principal | null): PrincipalResolver =>
  async () =>
    principal;

export function captureLogs() {
  const lines: string[] = [];
  return { lines, logger: createLogger((l) => lines.push(l), () => 0), parsed: () => lines.map((l) => JSON.parse(l)) };
}

export function recordingAudit() {
  const calls: AuditDeniedInput[] = [];
  const audit: AuditDenied = async (input) => {
    calls.push(input);
  };
  return { calls, audit };
}

type FactoryOpts = {
  now?: () => number;
  limiter?: RateLimiter;
  auditDenied?: AuditDenied;
  trustProxy?: boolean;
  preAuthLimit?: RateLimitRule | null;
  production?: boolean;
  resolvePrincipal?: PrincipalResolver;
} & Partial<Pick<RouteDeps, "secureCookies">>;

export function testFactory(principal: Principal | null, opts: FactoryOpts = {}) {
  const logs = captureLogs();
  const audit = recordingAudit();
  const store = new MemoryRateLimitStore();
  const defineRoute = createRouteFactory({
    resolvePrincipal: opts.resolvePrincipal ?? fakeResolver(principal),
    auditDenied: opts.auditDenied ?? audit.audit,
    limiter: opts.limiter ?? new RateLimiter(store, opts.now),
    keyer: createKeyer("test-secret"),
    logger: logs.logger,
    now: opts.now,
    trustProxy: opts.trustProxy ?? true,
    preAuthLimit: opts.preAuthLimit === undefined ? null : opts.preAuthLimit,
    production: opts.production ?? false,
    secureCookies: opts.secureCookies,
  });
  return { defineRoute, logs, store, audit: audit.calls };
}

export const ORIGIN = "http://fera.test";
export const sameOriginHeaders = { host: "fera.test", "sec-fetch-site": "same-origin" };

export const jsonPost = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(`${ORIGIN}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...sameOriginHeaders, ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

export const get = (path: string, headers: Record<string, string> = {}) =>
  new Request(`${ORIGIN}${path}`, { headers: { host: "fera.test", ...headers } });

export const noParams = { params: Promise.resolve({}) };

// Counts how often each pipeline step after a guard is reached.
export function reachCounter() {
  const hits = { parse: 0, authorize: 0, handler: 0 };
  return {
    hits,
    mark: (k: keyof typeof hits) => {
      hits[k]++;
      return true;
    },
  };
}
