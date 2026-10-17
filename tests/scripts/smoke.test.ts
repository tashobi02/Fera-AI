import { spawnSync } from "node:child_process";
// P3-213 unit tests for scripts/smoke.mjs. No network; every request is
// served by a fake fetch passed into runSmoke. Also asserts the contract
// between the .mjs literal and the Bangla locale it mirrors.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// @ts-expect-error -- plain ESM script without type declarations
import { runSmoke } from "../../scripts/smoke.mjs";

type CheckResult = { name: string; ok: boolean; detail: string };

function html(body: string, status = 200, headers: Record<string, string> = {}) {
  return () =>
    Promise.resolve(
      new Response(body, {
        status,
        headers: { "content-type": "text/html; charset=utf-8", ...headers },
      }),
    );
}

function json(body: unknown, status = 200) {
  return () =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      }),
    );
}

const BODY_MARKER = "SECRET-MARKER-DO-NOT-LEAK";

function okFetch(origin: string) {
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

describe("runSmoke (P3-213, TASK-042)", () => {
  it("returns ok for /api/health 200 with JSON, / with the badge, /sign-in with a <form>", async () => {
    const origin = "http://127.0.0.1:3000";
    const results = await runSmoke(origin, okFetch(origin) as unknown as typeof fetch);
    expect(getCheck(results, "health").ok).toBe(true);
    expect(getCheck(results, "home-badge").ok).toBe(true);
    expect(getCheck(results, "sign-in-form").ok).toBe(true);
    // Synthetic submit step is explicitly not counted: it is skipped, not pass/fail.
    const skipped = getCheck(results, "synthetic-submit");
    expect(skipped.ok).toBe(true);
    expect(skipped.detail).toBe("skipped: synthetic submit not implemented");
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
