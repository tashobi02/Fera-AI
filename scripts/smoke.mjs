#!/usr/bin/env node
// P3-213 / TASK-042: production smoke check for Fera (D2A API-019 health;
// D6 TASK-042). Used by `npm run smoke` and by P3-301 against a real URL.
//
// The script is plain ESM and is also importable as a library
// (`runSmoke(baseUrl, fetchImpl?)`) so the unit suite can exercise it without
// any network or server. The CLI path prints one line per check and exits
// 0 only if every check passes, 1 on a failed check, 2 on bad usage.
//
// What it checks (D2A API-019, D3 SCREEN-001/SCREEN-008, D6 TASK-042):
//   (a) GET /api/health returns 200 with a JSON body (status checked, body never printed)
//   (b) GET /          returns 200 and the Bangla "syntheticBadge" string from
//                      src/locales/index.ts is present in the HTML (synthetic-data banner)
//   (c) GET /sign-in   returns 200 and the HTML contains a literal <form element
//   (d) synthetic submit through the fake path is NOT implemented yet; that
//       step is logged as "skipped" and does not count as a pass or a fail.
//
// Safety:
//   - Accepts only http(s) URLs; rejects ftp:, javascript:, file:, data: etc.
//   - 10 s per-request timeout via AbortSignal.timeout.
//   - Refuses redirects to a different origin (same-origin only).
//   - Never prints response bodies, headers, cookies, or URLs that carry
//     credentials; only the check name, the status code, and a short fixed
//     reason are emitted. Failed checks include a short, fixed reason, not the
//     raw body or any leaked error text.
//
// .mjs cannot import the TS locale, so the expected Bangla badge text is
// duplicated here and asserted to match the locale value in the unit test
// (tests/scripts/smoke.test.ts reads the locale source).
import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";

const SYNTHETIC_BADGE_BN = "সিনথেটিক"; // src/locales/index.ts bn.syntheticBadge

const DEFAULT_BASE_URL = "http://127.0.0.1:3000";
const REQUEST_TIMEOUT_MS = 10_000;
const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

/**
 * Run the smoke checks against `baseUrl` using `fetchImpl` for each request.
 * Returns an array of {name, ok, detail}. Never throws; any thrown error from
 * fetchImpl is captured into the check's `ok=false` detail with a fixed reason.
 *
 * @param {string} baseUrl
 * @param {(input: string, init?: RequestInit) => Promise<Response>} [fetchImpl]
 * @returns {Promise<Array<{name: string, ok: boolean, detail: string}>>}
 */
export async function runSmoke(baseUrl, fetchImpl = fetch) {
  const f = fetchImpl ?? fetch;
  const origin = safeOrigin(baseUrl);
  /** @type {Array<{name: string, ok: boolean, detail: string}>} */
  const results = [];
  results.push(await checkHealth(origin, f));
  results.push(await checkHomeBadge(origin, f));
  results.push(await checkSignInForm(origin, f));
  results.push(skippedSyntheticSubmit());
  return results;
}

function skippedSyntheticSubmit() {
  return {
    name: "synthetic-submit",
    ok: true, // explicitly not counted as pass or fail
    detail: "skipped: synthetic submit not implemented",
  };
}

function safeOrigin(rawBaseUrl) {
  let url;
  try {
    url = new URL(rawBaseUrl);
  } catch {
    throw new SmokeUsageError(`invalid base URL: not a URL`);
  }
  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    throw new SmokeUsageError(`invalid base URL: protocol must be http or https`);
  }
  if (url.pathname !== "/" || url.search || url.hash) {
    throw new SmokeUsageError("invalid base URL: give an origin without a path");
  }
  // Strip userinfo defensively; we never want credentials in the request path.
  url.username = "";
  url.password = "";
  return url.origin;
}

async function fetchOnce(origin, path, fetchImpl) {
  const target = new URL(path, origin.endsWith("/") ? origin : origin + "/");
  // Strip any userinfo that could ride along if origin was passed in unexpectedly.
  target.username = "";
  target.password = "";
  const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  let res;
  let text = "";
  try {
    res = await fetchImpl(target.toString(), {
      method: "GET",
      redirect: "manual",
      signal,
      // No credentials: cookies/auth are never sent by a smoke check.
      credentials: "omit",
      headers: { accept: "application/json, text/html;q=0.9, */*;q=0.1" },
    });
    // 3xx bodies are never read; every other body is read while the timeout is live.
    if (res.status < 300 || res.status >= 400) text = await res.text();
  } catch (err) {
    // Do not echo the URL, the body, or the raw error; only a short, fixed reason.
    const timedOut = err && typeof err === "object" && "name" in err && (err.name === "AbortError" || err.name === "TimeoutError");
    return { ok: false, reason: timedOut ? "timeout" : "network error" };
  }

  // Refuse to follow redirects to a different origin; report as a failure with
  // a short reason and never surface the redirect Location header.
  if (res.status >= 300 && res.status < 400) {
    const location = res.headers.get("location");
    if (location) {
      let nextUrl;
      try {
        nextUrl = new URL(location, target);
      } catch {
        return { ok: false, reason: "redirect" };
      }
      if (nextUrl.origin !== target.origin) {
        return { ok: false, reason: "cross-origin redirect refused" };
      }
    }
    // Same-origin redirect: surface as redirect (smoke expects 200).
    return { ok: false, reason: "redirect" };
  }

  return { ok: true, status: res.status, text };
}

async function checkHealth(origin, fetchImpl) {
  const r = await fetchOnce(origin, "/api/health", fetchImpl);
  if (!r.ok) {
    return { name: "health", ok: false, detail: `fail (${r.reason})` };
  }
  if (r.status !== 200) {
    return { name: "health", ok: false, detail: `fail (status ${r.status})` };
  }
  // Confirm JSON from the body already read; never print it.
  try {
    const text = r.text;
    if (!text) {
      return { name: "health", ok: false, detail: "fail (empty body)" };
    }
    // API-019 publishes synthetic_only: a deployment without it must not pass.
    if (JSON.parse(text)?.synthetic_only !== true) {
      return { name: "health", ok: false, detail: "fail (not synthetic)" };
    }
  } catch {
    return { name: "health", ok: false, detail: "fail (not JSON)" };
  }
  return { name: "health", ok: true, detail: "ok (status 200)" };
}

async function checkHomeBadge(origin, fetchImpl) {
  const r = await fetchOnce(origin, "/", fetchImpl);
  if (!r.ok) {
    return { name: "home-badge", ok: false, detail: `fail (${r.reason})` };
  }
  if (r.status !== 200) {
    return { name: "home-badge", ok: false, detail: `fail (status ${r.status})` };
  }
  const html = r.text;
  if (!html.includes(SYNTHETIC_BADGE_BN)) {
    return { name: "home-badge", ok: false, detail: "fail (badge missing)" };
  }
  return { name: "home-badge", ok: true, detail: "ok (badge present)" };
}

async function checkSignInForm(origin, fetchImpl) {
  const r = await fetchOnce(origin, "/sign-in", fetchImpl);
  if (!r.ok) {
    return { name: "sign-in-form", ok: false, detail: `fail (${r.reason})` };
  }
  if (r.status !== 200) {
    return { name: "sign-in-form", ok: false, detail: `fail (status ${r.status})` };
  }
  const html = r.text;
  if (!/<form\b/i.test(html)) {
    return { name: "sign-in-form", ok: false, detail: "fail (no <form>)" };
  }
  return { name: "sign-in-form", ok: true, detail: "ok (form present)" };
}

class SmokeUsageError extends Error {
  constructor(message) {
    super(message);
    this.name = "SmokeUsageError";
  }
}

function parseArgs(argv) {
  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (typeof a !== "string") continue;
    if (a.startsWith("--")) {
      // The smoke CLI has no flags today; any flag is a usage error.
      throw new SmokeUsageError("unknown flag");
    }
    positional.push(a);
  }
  return positional;
}

async function main(argv) {
  let origin;
  try {
    const args = parseArgs(argv);
    origin = safeOrigin(args[0] || process.env.SMOKE_BASE_URL || DEFAULT_BASE_URL);
  } catch (err) {
    const usage = err instanceof SmokeUsageError;
    process.stderr.write(`smoke: ${usage ? err.message : "invalid arguments"}\nusage: smoke.mjs <base-url>\n`);
    return 2;
  }
  let results;
  try {
    results = await runSmoke(origin);
  } catch {
    process.stderr.write("smoke: internal error\n");
    return 1;
  }
  // Exit 0 iff every non-skipped check passed; the skipped step is printed, not counted.
  for (const r of results) process.stdout.write(`${r.name}: ${r.detail}\n`);
  return results.filter((r) => r.name !== "synthetic-submit").every((r) => r.ok) ? 0 : 1;
}

// Run only when invoked directly (not when imported by the unit test). Compared by real
// path so a symlink or renamed copy still runs instead of silently exiting 0.
const invokedDirectly = (() => {
  try {
    return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
  } catch {
    return false;
  }
})();
if (invokedDirectly) process.exit(await main(process.argv.slice(2)));
