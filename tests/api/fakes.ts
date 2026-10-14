// Test fakes for the shared API layer: a fixed principal resolver and a captured log sink.
import type { Principal } from "@/contracts/server";
import { createKeyer, createLogger, createRouteFactory, MemoryRateLimitStore, RateLimiter, type PrincipalResolver } from "@/app/api/_shared";

export const fakeResolver =
  (principal: Principal | null): PrincipalResolver =>
  async () =>
    principal;

export function captureLogs() {
  const lines: string[] = [];
  return { lines, logger: createLogger((l) => lines.push(l), () => 0), parsed: () => lines.map((l) => JSON.parse(l)) };
}

export function testFactory(principal: Principal | null, opts: { now?: () => number; limiter?: RateLimiter } = {}) {
  const logs = captureLogs();
  const store = new MemoryRateLimitStore();
  const defineRoute = createRouteFactory({
    resolvePrincipal: fakeResolver(principal),
    limiter: opts.limiter ?? new RateLimiter(store, opts.now),
    keyer: createKeyer("test-secret"),
    logger: logs.logger,
    now: opts.now,
  });
  return { defineRoute, logs, store };
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
