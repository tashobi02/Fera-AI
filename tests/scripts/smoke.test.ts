import { spawnSync } from "node:child_process";
// P3-213 / TASK-042 unit tests for scripts/smoke.mjs. No network; every request is
// served by a fake fetch passed into runSmoke. Also asserts the contract between
// the .mjs literal and the Bangla locale it mirrors.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  createMissingRequestSchema,
  createMissingResponseSchema,
  myCaseResponseSchema,
  ownerCaseViewSchema,
} from "@/contracts";
import { cookieNames } from "@/server/auth/tokens";

// @ts-expect-error -- plain ESM script without type declarations
import { runSmoke } from "../../scripts/smoke.mjs";

type CheckResult = { name: string; ok: boolean; detail: string; status?: string };
type FetchImpl = (input: string, init?: RequestInit) => Promise<Response>;

function html(body: string, status = 200, headers: Record<string, string> = {}) {
  return () =>
    Promise.resolve(
      new Response(body, {
        status,
        headers: { "content-type": "text/html; charset=utf-8", ...headers },
      }),
    );
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return () =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json", ...headers },
      }),
    );
}

const BODY_MARKER = "SECRET-MARKER-DO-NOT-LEAK";

function okFetch(origin: string): FetchImpl {
  return (input: string) => {
    const u = new URL(input, origin);
    if (u.pathname === "/api/health") {
      return json({
        version: "0.0.0",
        db: "unavailable",
        embeddings: "unavailable",
        synthetic_only: true,
        demo_mode: false,
      })();
    }
    if (u.pathname === "/") {
      return html(
        `<html><body><span>সিনথেটিক</span><span>${BODY_MARKER}</span></body></html>`,
      )();
    }
    if (u.pathname === "/sign-in") {
      return html(
        `<html><body><form method="post"></form><span>${BODY_MARKER}</span></body></html>`,
      )();
    }
    return new Promise<Response>((resolve) => {
      resolve(new Response("not found", { status: 404 }));
    });
  };
}

function getCheck(results: CheckResult[], name: string): CheckResult {
  const r = results.find((x) => x.name === name);
  if (!r) throw new Error(`expected check "${name}", got names: ${results.map((x) => x.name).join(", ")}`);
  return r;
}

// Synthetic fixtures are parsed through the frozen response contracts. Keeping
// the schemas here catches drift between the plain ESM smoke checks and routes.
function syntheticCreateResponse(opts: { id: string; ref: string; replayed: boolean }) {
  return createMissingResponseSchema.parse({
    id: opts.id,
    ref_code: opts.ref,
    kind: "missing",
    status: "open",
    status_group: "open",
    is_synthetic: true,
    version: 1,
    editable: true,
    matching_state: "complete",
    draft: null,
    created_at: "2026-10-12T20:00:00+06:00",
    updated_at: "2026-10-12T20:05:00+06:00",
    replayed: opts.replayed,
    outputs_available: [],
  });
}

function ownerViewResponse(opts: { id: string; ref: string }) {
  return ownerCaseViewSchema.parse({
    id: opts.id,
    ref_code: opts.ref,
    kind: "missing",
    status: "open",
    status_group: "open",
    is_synthetic: true,
    version: 1,
    editable: true,
    matching_state: "complete",
    draft: null,
    created_at: "2026-10-12T20:00:00+06:00",
    updated_at: "2026-10-12T20:05:00+06:00",
  });
}

function myCaseResponse(opts: { id: string; ref: string }) {
  return myCaseResponseSchema.parse({
    reports: [
      {
        id: opts.id,
        ref_code: opts.ref,
        kind: "missing",
        status: "open",
        status_group: "open",
        updated_at: "2026-10-12T20:05:00+06:00",
        editable: true,
      },
    ],
  });
}

// Capture every cookie the fake server has seen so the test can prove the
// script sent the parent session on the read-back. The script's own in-memory
// jar is private; we observe it through Set-Cookie on the synthetic post.
function syntheticSubmitFetch(
  origin: string,
  opts: {
    id: string;
    ref: string;
    includeStatus?: boolean;
    setCookieName?: string;
  },
): FetchImpl {
  return async (input: string, init: RequestInit = {}) => {
    const u = new URL(input, origin);
    if (u.pathname === "/api/health") {
      return json({
        version: "0.0.0",
        synthetic_only: true,
        demo_mode: false,
        db: "unavailable",
        embeddings: "unavailable",
      })();
    }
    if (u.pathname === "/") {
      return html(`<html><body><span>সিনথেটিক</span></body></html>`)();
    }
    if (u.pathname === "/sign-in") {
      return html(`<html><body><form method="post"></form></body></html>`)();
    }
    if (u.pathname === "/api/cases" && (init.method ?? "GET") === "POST") {
      const cookie = (init.headers as Record<string, string> | undefined)?.cookie ?? "";
      const isReplay = cookie.includes(cookieNames(false).parent) || cookie.includes(cookieNames(true).parent);
      const body = JSON.parse(String(init.body));
      // Body must be the strict, confirmed, frozen-API-003 MOCK payload.
      const request = createMissingRequestSchema.parse(body);
      if (!request.draft.source_text.startsWith("[MOCK]")) return json({ error: "no" }, 400)();
      if (typeof body.client_submission_id !== "string") return json({ error: "no" }, 400)();
      if (!body.draft || body.draft.kind !== "missing") return json({ error: "no" }, 400)();
      if (typeof body.draft.child?.name !== "string") return json({ error: "no" }, 400)();
      if (body.draft.reporter?.phone !== "01200000001") return json({ error: "no" }, 400)();
      const headers: Record<string, string> = {};
      if (isReplay) {
        headers["set-cookie"] = `${opts.setCookieName ?? cookieNames(false).parent}=replay-value; Path=/; HttpOnly`;
      } else {
        headers["set-cookie"] = `${opts.setCookieName ?? cookieNames(false).parent}=parent-session; Path=/; HttpOnly`;
      }
      return json(
        syntheticCreateResponse({
          id: opts.id,
          ref: opts.ref,
          replayed: isReplay,
        }),
        isReplay ? 200 : 201,
        headers,
      )();
    }
    if (u.pathname === `/api/cases/${opts.id}`) {
      const cookie = (init.headers as Record<string, string> | undefined)?.cookie ?? "";
      if (!cookie.includes(cookieNames(false).parent) && !cookie.includes(cookieNames(true).parent)) {
        return json({ error: "unauthorised" }, 401)();
      }
      return json(ownerViewResponse({ id: opts.id, ref: opts.ref }))();
    }
    if (u.pathname === "/api/my-case") {
      const cookie = (init.headers as Record<string, string> | undefined)?.cookie ?? "";
      if (!cookie.includes(cookieNames(false).parent) && !cookie.includes(cookieNames(true).parent)) return json({ error: "unauthorised" }, 401)();
      return json(myCaseResponse({ id: opts.id, ref: opts.ref }))();
    }
    return new Response("not found", { status: 404 });
  };
}

describe("runSmoke (P3-213, TASK-042) — default read-only path", () => {
  it("returns ok for /api/health 200 with JSON, / with the badge, /sign-in with a <form>", async () => {
    const origin = "http://127.0.0.1:3000";
    const results = await runSmoke(origin, okFetch(origin) as unknown as typeof fetch);
    expect(getCheck(results, "health").ok).toBe(true);
    expect(getCheck(results, "home-badge").ok).toBe(true);
    expect(getCheck(results, "sign-in-form").ok).toBe(true);
    // Default path: the synthetic-submit step is explicitly NOT counted.
    const skipped = getCheck(results, "synthetic-submit");
    expect(skipped.ok).toBe(false);
    expect(skipped.status).toBe("skipped");
    expect(skipped.detail).toBe("skipped: --synthetic-submit not set");
  });

  it("fails the health check when the body is JSON but not synthetic_only", async () => {
    const origin = "http://127.0.0.1:3000";
    const base = okFetch(origin);
    const fetchImpl = (input: string) => {
      if (new URL(input, origin).pathname === "/api/health") return json({ version: "0.0.0", synthetic_only: false })();
      return base(input);
    };
    const health = getCheck(await runSmoke(origin, fetchImpl as unknown as typeof fetch), "health");
    expect(health.ok).toBe(false);
    expect(health.detail).toContain("not synthetic");
  });

  it("reports a body read that times out as a fixed 'timeout' reason", async () => {
    const origin = "http://127.0.0.1:3000";
    const base = okFetch(origin);
    const fetchImpl = (input: string) => {
      if (new URL(input, origin).pathname !== "/api/health") return base(input);
      const stalled = { status: 200, headers: new Headers(), text: () => Promise.reject(Object.assign(new Error(BODY_MARKER), { name: "TimeoutError" })) };
      return Promise.resolve(stalled as unknown as Response);
    };
    const health = getCheck(await runSmoke(origin, fetchImpl as unknown as typeof fetch), "health");
    expect(health.ok).toBe(false);
    expect(health.detail).toContain("timeout");
    expect(health.detail).not.toContain(BODY_MARKER);
  });

  it("CLI: a base URL with a path or an unknown flag exits 2 and never echoes the flag value", () => {
    const run = (...args: string[]) => spawnSync(process.execPath, ["scripts/smoke.mjs", ...args], { encoding: "utf8" });
    const pathUrl = run("http://127.0.0.1:1/fera");
    expect(pathUrl.status).toBe(2);
    const flag = run("--token=hunter2");
    expect(flag.status).toBe(2);
    expect(flag.stderr + flag.stdout).not.toContain("hunter2");
  });

  it("CLI: --help exits 0 and never echoes flag-like values", () => {
    const run = (...args: string[]) => spawnSync(process.execPath, ["scripts/smoke.mjs", ...args], { encoding: "utf8" });
    const out = run("--help");
    expect(out.status).toBe(0);
    expect(out.stdout).toContain("--synthetic-submit");
    expect(out.stdout).not.toContain(BODY_MARKER);
  });

  it("fails the health check when /api/health returns 500 JSON", async () => {
    const origin = "http://127.0.0.1:3000";
    const fetchImpl = (input: string) => {
      const u = new URL(input, origin);
      if (u.pathname === "/api/health") return json({ error: BODY_MARKER }, 500)();
      return okFetch(origin)(input);
    };
    const results = await runSmoke(origin, fetchImpl as unknown as typeof fetch);
    const health = getCheck(results, "health");
    expect(health.ok).toBe(false);
    expect(health.detail).toContain("status 500");
    expect(health.detail).not.toContain(BODY_MARKER);
  });

  it("fails the home-badge check when the badge string is absent from /", async () => {
    const origin = "http://127.0.0.1:3000";
    const fetchImpl = (input: string) => {
      const u = new URL(input, origin);
      if (u.pathname === "/") return html(`<html><body><span>other text ${BODY_MARKER}</span></body></html>`)();
      return okFetch(origin)(input);
    };
    const results = await runSmoke(origin, fetchImpl as unknown as typeof fetch);
    const badge = getCheck(results, "home-badge");
    expect(badge.ok).toBe(false);
    expect(badge.detail).toContain("badge missing");
    expect(badge.detail).not.toContain(BODY_MARKER);
  });

  it("fails the sign-in-form check when /sign-in has no <form", async () => {
    const origin = "http://127.0.0.1:3000";
    const fetchImpl = (input: string) => {
      const u = new URL(input, origin);
      if (u.pathname === "/sign-in") return html(`<html><body><div>${BODY_MARKER}</div></body></html>`)();
      return okFetch(origin)(input);
    };
    const results = await runSmoke(origin, fetchImpl as unknown as typeof fetch);
    const sign = getCheck(results, "sign-in-form");
    expect(sign.ok).toBe(false);
    expect(sign.detail).toContain("no <form>");
    expect(sign.detail).not.toContain(BODY_MARKER);
  });

  it("rejects http(s)-only base URLs such as ftp: and javascript:", async () => {
    await expect(runSmoke("ftp://example.invalid", (() => {}) as unknown as typeof fetch)).rejects.toThrow(
      /protocol must be http or https/,
    );
    await expect(runSmoke("javascript:alert(1)", (() => {}) as unknown as typeof fetch)).rejects.toThrow(
      /protocol must be http or https/,
    );
  });

  it("reports a fetch timeout as a failure without leaking the error body", async () => {
    const origin = "http://127.0.0.1:3000";
    const timedOut = async () => {
      const err: Error & { name: string } = new Error(`${BODY_MARKER}-thrown-error-message`);
      err.name = "AbortError";
      throw err;
    };
    const results = await runSmoke(origin, timedOut as unknown as typeof fetch);
    for (const r of results as CheckResult[]) {
      if (r.name === "synthetic-submit") continue;
      expect(r.ok).toBe(false);
      expect(r.detail).not.toContain(BODY_MARKER);
    }
  });

  it("reports an arbitrary fetch throw as a failure without leaking the error body", async () => {
    const origin = "http://127.0.0.1:3000";
    const boom = async () => {
      throw new Error(`${BODY_MARKER}-unexpected-network-failure`);
    };
    const results = await runSmoke(origin, boom as unknown as typeof fetch);
    for (const r of results as CheckResult[]) {
      if (r.name === "synthetic-submit") continue;
      expect(r.ok).toBe(false);
      expect(r.detail).not.toContain(BODY_MARKER);
    }
  });

  it("never prints a response body marker in any check detail", async () => {
    const origin = "http://127.0.0.1:3000";
    const results = await runSmoke(origin, okFetch(origin) as unknown as typeof fetch);
    for (const r of results as CheckResult[]) {
      expect(r.detail).not.toContain(BODY_MARKER);
    }
    // Also check what the CLI would print: details always live in `detail`.
    const lines = results.map((r: CheckResult) => `${r.name}: ${r.ok ? "ok" : "fail"} (${r.detail})`);
    for (const line of lines) {
      expect(line).not.toContain(BODY_MARKER);
    }
  });
});

describe("runSmoke (P3-213, TASK-042) — opt-in synthetic submit", () => {
  it("refuses to write when health is not synthetic_only", async () => {
    const origin = "http://127.0.0.1:3000";
    const base = okFetch(origin);
    const fetchImpl = (input: string) => {
      if (new URL(input, origin).pathname === "/api/health") return json({ version: "0.0.0", synthetic_only: false })();
      return base(input);
    };
    const results = await runSmoke(origin, fetchImpl as unknown as typeof fetch, { syntheticSubmit: true });
    const sub = getCheck(results, "synthetic-submit");
    expect(sub.ok).toBe(false);
    expect(sub.status).toBe("refused");
    expect(sub.detail).toContain("not synthetic");
  });

  it("refuses to write to a non-loopback target unless the operator opts in", async () => {
    const origin = "https://fera.example.com";
    const base = okFetch(origin);
    const results = await runSmoke(origin, base as unknown as typeof fetch, { syntheticSubmit: true });
    const sub = getCheck(results, "synthetic-submit");
    expect(sub.ok).toBe(false);
    expect(sub.status).toBe("refused");
    expect(sub.detail).toContain("non-loopback");
  });

  it("allows a non-loopback target when FERA_SMOKE_ALLOW_NON_LOOPBACK=1 is set", async () => {
    const origin = "https://fera.example.com";
    const fetchImpl = syntheticSubmitFetch(origin, { id: "6b1f3c2a-4d5e-4f60-8a71-000000000061", ref: "M-7K2Q9A" });
    const results = await runSmoke(origin, fetchImpl as unknown as typeof fetch, {
      syntheticSubmit: true,
      env: { FERA_SMOKE_ALLOW_NON_LOOPBACK: "1" },
    });
    const sub = getCheck(results, "synthetic-submit");
    expect(sub.ok).toBe(true);
    expect(sub.detail).toBe("ok (mutated, read back)");
  });

  it("skips the synthetic submit by default and never counts it as a pass", async () => {
    const origin = "http://127.0.0.1:3000";
    // The synthetic submit fetch is not needed: default is skipped.
    const results = await runSmoke(origin, okFetch(origin) as unknown as typeof fetch);
    const sub = getCheck(results, "synthetic-submit");
    expect(sub.ok).toBe(false);
    expect(sub.status).toBe("skipped");
    expect(sub.detail).toBe("skipped: --synthetic-submit not set");
  });

  it("passes the mutation: posts, captures the cookie, replays idempotently, and reads the owner view", async () => {
    const origin = "http://127.0.0.1:3000";
    const id = "6b1f3c2a-4d5e-4f60-8a71-000000000061";
    const ref = "M-7K2Q9A";
    const fetchImpl = syntheticSubmitFetch(origin, { id, ref });
    const results = await runSmoke(origin, fetchImpl as unknown as typeof fetch, { syntheticSubmit: true });
    const sub = getCheck(results, "synthetic-submit");
    expect(sub.ok).toBe(true);
    expect(sub.detail).toBe("ok (mutated, read back)");
  });

  it("with --with-status, also calls /api/my-case and asserts the new case is listed", async () => {
    const origin = "http://127.0.0.1:3000";
    const id = "6b1f3c2a-4d5e-4f60-8a71-000000000061";
    const ref = "M-7K2Q9A";
    const fetchImpl = syntheticSubmitFetch(origin, { id, ref, includeStatus: true });
    const results = await runSmoke(origin, fetchImpl as unknown as typeof fetch, {
      syntheticSubmit: true,
      withStatus: true,
    });
    const sub = getCheck(results, "synthetic-submit");
    expect(sub.ok).toBe(true);
  });

  it("rejects the response if the post status is not 200 or 201", async () => {
    const origin = "http://127.0.0.1:3000";
    const base = okFetch(origin);
    const fetchImpl: FetchImpl = (input, init) => {
      const u = new URL(input, origin);
      if (u.pathname === "/api/cases" && (init?.method ?? "GET") === "POST") {
        return json({ error: BODY_MARKER }, 500)();
      }
      return base(input, init);
    };
    const results = await runSmoke(origin, fetchImpl as unknown as typeof fetch, { syntheticSubmit: true });
    const sub = getCheck(results, "synthetic-submit");
    expect(sub.ok).toBe(false);
    expect(sub.detail).toContain("post status 500");
    expect(sub.detail).not.toContain(BODY_MARKER);
  });

  it("rejects the response if the post body is not JSON", async () => {
    const origin = "http://127.0.0.1:3000";
    const base = okFetch(origin);
    const fetchImpl: FetchImpl = (input, init) => {
      const u = new URL(input, origin);
      if (u.pathname === "/api/cases" && (init?.method ?? "GET") === "POST") {
        return new Promise<Response>((resolve) => {
          resolve(
            new Response(`not json ${BODY_MARKER}`, {
              status: 201,
              headers: { "content-type": "text/plain", "set-cookie": "fera_ps=parent-session; Path=/" },
            }),
          );
        });
      }
      return base(input, init);
    };
    const results = await runSmoke(origin, fetchImpl as unknown as typeof fetch, { syntheticSubmit: true });
    const sub = getCheck(results, "synthetic-submit");
    expect(sub.ok).toBe(false);
    expect(sub.detail).toContain("not JSON");
    expect(sub.detail).not.toContain(BODY_MARKER);
  });

  it("rejects the response if no parent session cookie is set on the post", async () => {
    const origin = "http://127.0.0.1:3000";
    const base = okFetch(origin);
    const fetchImpl: FetchImpl = (input, init) => {
      const u = new URL(input, origin);
      if (u.pathname === "/api/cases" && (init?.method ?? "GET") === "POST") {
        return json(syntheticCreateResponse({ id: "6b1f3c2a-4d5e-4f60-8a71-000000000061", ref: "M-7K2Q9A", replayed: false }), 201)();
      }
      return base(input, init);
    };
    const results = await runSmoke(origin, fetchImpl as unknown as typeof fetch, { syntheticSubmit: true });
    const sub = getCheck(results, "synthetic-submit");
    expect(sub.ok).toBe(false);
    expect(sub.detail).toContain("no parent session cookie");
  });

  it("rejects the response if the replay does not report replayed: true with the same id", async () => {
    const origin = "http://127.0.0.1:3000";
    const id = "6b1f3c2a-4d5e-4f60-8a71-000000000061";
    const ref = "M-7K2Q9A";
    const base = syntheticSubmitFetch(origin, { id, ref });
    let posted = 0;
    const fetchImpl: FetchImpl = async (input, init) => {
      const u = new URL(input, origin);
      if (u.pathname === "/api/cases" && (init?.method ?? "GET") === "POST") {
        posted += 1;
        if (posted === 1) return base(input, init);
        // The replay claims a different id, breaking idempotence.
        return json(
          syntheticCreateResponse({
            id: "6b1f3c2a-4d5e-4f60-8a71-000000000062",
            ref,
            replayed: true,
          }),
          200,
          { "set-cookie": "fera_ps=replay-value; Path=/" },
        )();
      }
      return base(input, init);
    };
    const results = await runSmoke(origin, fetchImpl as unknown as typeof fetch, { syntheticSubmit: true });
    const sub = getCheck(results, "synthetic-submit");
    expect(sub.ok).toBe(false);
    expect(sub.detail).toContain("not idempotent");
  });

  it("rejects a redirected owner read with a fixed 'redirect' reason and no leak", async () => {
    const origin = "http://127.0.0.1:3000";
    const id = "6b1f3c2a-4d5e-4f60-8a71-000000000061";
    const ref = "M-7K2Q9A";
    const base = syntheticSubmitFetch(origin, { id, ref });
    const fetchImpl: FetchImpl = (input, init) => {
      const u = new URL(input, origin);
      if (u.pathname === `/api/cases/${id}`) {
        return new Promise<Response>((resolve) => {
          resolve(new Response(null, { status: 302, headers: { location: "/somewhere-else" } }));
        });
      }
      return base(input, init);
    };
    const results = await runSmoke(origin, fetchImpl as unknown as typeof fetch, { syntheticSubmit: true });
    const sub = getCheck(results, "synthetic-submit");
    expect(sub.ok).toBe(false);
    expect(sub.detail).toContain("read");
    expect(sub.detail).not.toContain("/somewhere-else");
    expect(sub.detail).not.toContain(BODY_MARKER);
  });

  it("rejects a post that times out with a fixed 'timeout' reason and no leak", async () => {
    const origin = "http://127.0.0.1:3000";
    const base = okFetch(origin);
    const fetchImpl: FetchImpl = (input, init) => {
      const u = new URL(input, origin);
      if (u.pathname === "/api/cases" && (init?.method ?? "GET") === "POST") {
        const err: Error & { name: string } = new Error(`${BODY_MARKER}-post-timeout`);
        err.name = "AbortError";
        throw err;
      }
      return base(input, init);
    };
    const results = await runSmoke(origin, fetchImpl as unknown as typeof fetch, { syntheticSubmit: true });
    const sub = getCheck(results, "synthetic-submit");
    expect(sub.ok).toBe(false);
    expect(sub.detail).toContain("timeout");
    expect(sub.detail).not.toContain(BODY_MARKER);
  });

  it("never logs cookies, headers, or the request body in any check detail", async () => {
    const origin = "http://127.0.0.1:3000";
    const id = "6b1f3c2a-4d5e-4f60-8a71-000000000061";
    const ref = "M-7K2Q9A";
    const fetchImpl = syntheticSubmitFetch(origin, { id, ref });
    const results = await runSmoke(origin, fetchImpl as unknown as typeof fetch, {
      syntheticSubmit: true,
      withStatus: true,
    });
    const all = results.map((r: { name: string; detail: string }) => `${r.name}: ${r.detail}`).join("\n");
    expect(all).not.toContain(BODY_MARKER);
    expect(all).not.toContain("01700000001");
    expect(all).not.toContain("M-7K2Q9A");
    expect(all).not.toContain("fera_ps");
    expect(all).not.toContain("__Host-fera_ps");
  });

  it("preserves the legacy two-argument runSmoke(baseUrl, fetchImpl) call site", async () => {
    // Existing callers pass only two arguments; this must still work and the
    // synthetic-submit step must stay skipped (not opt in by accident).
    const origin = "http://127.0.0.1:3000";
    const results = await runSmoke(origin, okFetch(origin) as unknown as typeof fetch);
    expect(getCheck(results, "synthetic-submit").status).toBe("skipped");
    expect(getCheck(results, "health").ok).toBe(true);
  });
});

describe("Smoke script literal matches the Bangla locale (P3-213)", () => {
  it("the embedded SYNTHETIC_BADGE_BN literal equals bn.syntheticBadge in src/locales/index.ts", () => {
    // Read the locale source as text so the .mjs script (which cannot import
    // TS) and the unit test stay coupled without needing a TS import path.
    const localesPath = fileURLToPath(new URL("../../src/locales/index.ts", import.meta.url));
    const source = readFileSync(localesPath, "utf8");
    // Match the bn block's syntheticBadge value; tolerate whitespace/newlines.
    const match = source.match(/syntheticBadge:\s*["'`]([^"'`]+)["'`]/);
    expect(match).not.toBeNull();
    const localeValue = match?.[1] ?? "";
    expect(localeValue.length).toBeGreaterThan(0);
    // Read the script source and pull the same literal it embeds.
    const scriptPath = fileURLToPath(new URL("../../scripts/smoke.mjs", import.meta.url));
    const scriptSource = readFileSync(scriptPath, "utf8");
    const literalMatch = scriptSource.match(/SYNTHETIC_BADGE_BN\s*=\s*["'`]([^"'`]+)["'`]/);
    expect(literalMatch).not.toBeNull();
    const scriptValue = literalMatch?.[1] ?? "";
    expect(scriptValue).toBe(localeValue);
    expect(scriptValue).toBe("সিনথেটিক"); // D3 COMP-023
  });
});
