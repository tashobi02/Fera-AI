#!/usr/bin/env node
// P3-213 / TASK-042: production smoke check for Fera (D2A API-019 health;
// D6 TASK-042). Used by `npm run smoke` and by P3-301 against a real URL.
//
// The script is plain ESM and is also importable as a library
// (`runSmoke(baseUrl, fetchImpl?, options?)`) so the unit suite can exercise
// it without any network or server. The CLI path prints one line per check
// and exits 0 only if every non-skipped check passes, 1 on a failed check,
// 2 on bad usage.
//
// What it checks (D2A API-019, D3 SCREEN-001/SCREEN-008, D6 TASK-042):
//   (a) GET /api/health returns 200 with a JSON body (status checked, body never printed)
//   (b) GET /          returns 200 and the Bangla "syntheticBadge" string from
//                      src/locales/index.ts is present in the HTML (synthetic-data banner)
//   (c) GET /sign-in   returns 200 and the HTML contains a literal <form element
//   (d) synthetic submit through the parent API (API-003) is OPT-IN only and
//       runs by default as a clearly-labelled "skipped" check that is never
//       counted as a pass in the CLI summary. When invoked with the
//       `--synthetic-submit` CLI flag (or `syntheticSubmit: true` in the
//       library options), it runs a real, strict-MOCK parent submit through
//       the existing routes and is required to pass before the script exits 0.
//
// Synthetic submit (opt-in, default OFF):
//   - Health must first prove `synthetic_only: true`; without that, the
//     mutation step is refused and reported as a failure, never silently run.
//   - The base URL must resolve to a local loopback address
//     (127.0.0.0/8, ::1, or localhost) unless the operator explicitly sets
//     `FERA_SMOKE_ALLOW_NON_LOOPBACK=1`. The script never silently posts to
//     a guessed or production URL.
//   - The request body is a strict, frozen-API003 MOCK payload
//     (`[MOCK]` source text, synthetic child name, `confirmed: true`,
//     explicit `client_submission_id`). No live child data, no provider
//     or LLM call.
//   - The `fera_ps` parent session cookie is captured in memory from the
//     POST /api/cases response Set-Cookie and reused for the owner read;
//     it is never logged, persisted, or echoed.
//   - The same `client_submission_id` is replayed and the response must
//     report `replayed: true` (idempotence).
//   - The captured cookie is then used to GET the new case through
//     /api/cases/{id} (API-004 owner view) and, when `--with-status`
//     is set, /api/my-case (API-018).
//   - No cookies, headers, request bodies, or raw response bodies are
//     printed; only fixed short reason strings.
//
// Safety:
//   - Accepts only http(s) URLs; rejects ftp:, javascript:, file:, data: etc.
//   - 10 s per-request timeout via AbortSignal.timeout.
//   - Refuses redirects to a different origin (same-origin only).
//   - Never prints response bodies, headers, cookies, or URLs that carry
//     credentials; only the check name, the status code, and a short fixed
//     reason are emitted. Failed checks include a short, fixed reason, not the
//     raw body or any leaked error text.
//   - The mutation check is a separate, opt-in code path; the default run is
//     read-only and produces no server writes.
//
// .mjs cannot import the TS locale, so the expected Bangla badge text is
// duplicated here and asserted to match the locale value in the unit test
// (tests/scripts/smoke.test.ts reads the locale source).
import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";

const SYNTHETIC_BADGE_BN = "সিনথেটিক"; // src/locales/index.ts bn.syntheticBadge

const DEFAULT_BASE_URL = "http://127.0.0.1:3000";
const REQUEST_TIMEOUT_MS = 10_000;
const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);
const NON_LOOPBACK_OPT_IN = "FERA_SMOKE_ALLOW_NON_LOOPBACK";

// Fixed synthetic MOCK payload. The reserved 0120000NNNN phone block is not a
// real subscriber number. Its explicit date and time agree with the source text.
const SYNTHETIC_SOURCE_TEXT =
  "[MOCK] ২০২৬ সালের ১২ অক্টোবর বিকেল ৪টার দিকে মেয়ে মিতু (৭ বছর) বাস টার্মিনালের কাছে হারিয়ে যায়। সে লাল জামা পরেছিল। যোগাযোগ নম্বর ০১২০০০০০০০১।";
const SYNTHETIC_DISTRICT_CODE = 26; // MOCK district; matches DISTRICT in src/contracts/examples.ts
// at/at_lower/at_upper are kept in the past and bracketed within CLOCK_SKEW_MS so a
// strict server clock accepts them; the smoke script never invents future dates.
const SYNTHETIC_EVENT_AT = "2026-10-12T16:00:00+06:00";
const SYNTHETIC_EVENT_AT_LOWER = "2026-10-12T15:00:00+06:00";
const SYNTHETIC_EVENT_AT_UPPER = "2026-10-12T18:00:00+06:00";

/**
 * Build a synthetic parent payload that satisfies the frozen API-003
 * `createMissingRequestSchema`. The body is hand-built from the literal
 * MOCK fixture; the smoke script never calls the LLM/STT/normaliser path.
 *
 * @param {string} clientSubmissionId
 * @returns {object}
 */
function buildSyntheticCreateMissingRequest(clientSubmissionId) {
  const evidence = (quote, derivation) => {
    const start = SYNTHETIC_SOURCE_TEXT.indexOf(quote);
    if (start < 0) throw new Error(`synthetic quote not in source: ${quote}`);
    return { quote, start_utf16: start, end_utf16: start + quote.length, derivation };
  };
  return {
    draft: {
      kind: "missing",
      source_text: SYNTHETIC_SOURCE_TEXT,
      child: {
        name: "মিতু",
        name_latin: "Mitu",
        age_years: 7,
        age_min: 7,
        age_max: 7,
        sex: "female",
        height_cm: null,
        clothing: "লাল জামা",
        marks: null,
      },
      event: {
        at: SYNTHETIC_EVENT_AT,
        at_approx: true,
        at_lower: SYNTHETIC_EVENT_AT_LOWER,
        at_upper: SYNTHETIC_EVENT_AT_UPPER,
        place_text: "বাস টার্মিনালের কাছে",
        district_text: null,
        district_code: SYNTHETIC_DISTRICT_CODE,
        thana: null,
        circumstances: null,
      },
      reporter: { relation: null, phone: "01200000001" },
      evidence: {
        "child.name": evidence("মিতু", "direct"),
        "child.age_years": evidence("৭", "digits"),
        "child.sex": evidence("মেয়ে", "direct"),
        "child.clothing": evidence("লাল জামা", "direct"),
        "event.at": evidence("২০২৬ সালের ১২ অক্টোবর বিকেল ৪টার দিকে", "time_interval"),
        "event.place_text": evidence("বাস টার্মিনালের কাছে", "direct"),
        "reporter.phone": evidence("০১২০০০০০০০১", "digits"),
      },
    },
    confirmed: true,
    client_submission_id: clientSubmissionId,
    // No `draft_token`: the manual form path (OD-022-5) intentionally omits it.
  };
}

/**
 * @typedef {Object} RunSmokeOptions
 * @property {boolean} [syntheticSubmit] - Run a real, mutating parent submit (default false).
 * @property {boolean} [withStatus]      - Also call GET /api/my-case (default false).
 * @property {(name: string) => readonly string[]} [cookieSource] - Read captured cookies.
 * @property {Record<string, string>} [env] - Environment overrides (loopback opt-in only).
 */

/**
 * Run the smoke checks against `baseUrl` using `fetchImpl` for each request.
 * Returns an array of {name, ok, detail}. Never throws; any thrown error from
 * fetchImpl is captured into the check's `ok=false` detail with a fixed reason.
 *
 * The third argument is an options bag; passing it preserves the legacy
 * `runSmoke(baseUrl, fetchImpl)` two-argument form for existing callers.
 *
 * @param {string} baseUrl
 * @param {(input: string, init?: RequestInit) => Promise<Response>} [fetchImpl]
 * @param {RunSmokeOptions} [options]
 * @returns {Promise<Array<{name: string, ok: boolean, detail: string, status?: string}>>}
 */
export async function runSmoke(baseUrl, fetchImpl, options = {}) {
  const f = fetchImpl ?? fetch;
  const opts = options || {};
  const origin = safeOrigin(baseUrl);
  /** @type {Array<{name: string, ok: boolean, detail: string, status?: string}>} */
  const results = [];
  const health = await checkHealth(origin, f);
  results.push(health);
  results.push(await checkHomeBadge(origin, f));
  results.push(await checkSignInForm(origin, f));
  if (opts.syntheticSubmit === true) {
    results.push(await checkSyntheticSubmit(origin, f, opts, health));
  } else {
    results.push(skippedSyntheticSubmit());
  }
  return results;
}

function skippedSyntheticSubmit() {
  return {
    name: "synthetic-submit",
    ok: false, // never a pass: only the opt-in path can mark this check ok
    detail: "skipped: --synthetic-submit not set",
    status: "skipped",
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

// A base URL is a local loopback target when its host is one of the loopback
// literal names (127.x, ::1, localhost). Anything else is "remote" and the
// synthetic submit path will refuse to write unless the operator has set
// FERA_SMOKE_ALLOW_NON_LOOPBACK=1 in the environment.
function isLoopbackOrigin(origin) {
  let u;
  try {
    u = new URL(origin);
  } catch {
    return false;
  }
  const h = u.hostname.toLowerCase();
  if (h === "localhost" || h === "::1") return true;
  if (/^127(?:\.[0-9]{1,3}){0,3}$/.test(h)) return true;
  return false;
}

async function fetchOnce(origin, path, fetchImpl, init = {}) {
  const target = new URL(path, origin.endsWith("/") ? origin : origin + "/");
  // Strip any userinfo that could ride along if origin was passed in unexpectedly.
  target.username = "";
  target.password = "";
  const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  let res;
  let text = "";
  try {
    res = await fetchImpl(target.toString(), {
      method: init.method ?? "GET",
      redirect: "manual",
      signal,
      // Cookies are not sent automatically: each request owns its own cookie store.
      credentials: "omit",
      headers: {
        accept: "application/json, text/html;q=0.9, */*;q=0.1",
        ...(init.headers ?? {}),
      },
      ...(init.body !== undefined ? { body: init.body } : {}),
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

  return { ok: true, status: res.status, text, headers: res.headers };
}

// The health probe is reused: the mutation check must not start unless the
// deployment is explicitly synthetic-only. `prev` is the health result that
// was just appended to the run; when health is not synthetic, refuse.
function healthProvesSyntheticOnly(prev) {
  return Boolean(prev && prev.ok && prev.detail === "ok (status 200)");
}

// These keys mirror the strict frozen API-003/API-004/API-018 response schemas.
// The corresponding test fixtures are parsed by those Zod schemas so drift in
// this plain ESM smoke script is caught by the focused unit suite.
const CREATE_MISSING_RESPONSE_KEYS = [
  "id", "ref_code", "kind", "status", "status_group", "is_synthetic", "version",
  "editable", "matching_state", "draft", "created_at", "updated_at", "replayed", "outputs_available",
];
const OWNER_CASE_VIEW_KEYS = [
  "id", "ref_code", "kind", "status", "status_group", "is_synthetic", "version",
  "editable", "matching_state", "draft", "created_at", "updated_at",
];
const MY_CASE_RESPONSE_KEYS = ["reports"];
const MY_CASE_REPORT_KEYS = ["id", "ref_code", "kind", "status", "status_group", "updated_at", "editable"];

function hasExactKeys(value, expectedKeys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return keys.length === expectedKeys.length && expectedKeys.every((key) => Object.hasOwn(value, key));
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

// Mutation check: real synthetic parent submit through API-003, owner read
// through API-004, optional status through API-018. Cookies are kept in
// memory; nothing is logged. The check is structured as a small sequence of
// sub-steps so the failure detail names the exact sub-step.
async function checkSyntheticSubmit(origin, fetchImpl, options, healthResult) {
  // Health must prove synthetic_only before any mutation: a non-synthetic
  // deployment is never a target for the smoke run.
  if (!healthProvesSyntheticOnly(healthResult)) {
    return {
      name: "synthetic-submit",
      ok: false,
      detail: "fail (health not synthetic)",
      status: "refused",
    };
  }
  // Loopback-only unless the operator has explicitly opted in. The check
  // never silently posts to a guessed or production URL.
  const env = options.env ?? process.env;
  if (!isLoopbackOrigin(origin) && env[NON_LOOPBACK_OPT_IN] !== "1") {
    return {
      name: "synthetic-submit",
      ok: false,
      detail: `fail (non-loopback target; set ${NON_LOOPBACK_OPT_IN}=1 to opt in)`,
      status: "refused",
    };
  }

  // In-memory cookie store keyed by cookie name. Only the value of the
  // `fera_ps` (or its `__Host-` variant on a Secure deploy) cookie is held
  // for the duration of this check, then dropped.
  /** @type {Map<string, string>} */
  const jar = new Map();
  const cookieHeader = () => {
    const out = [];
    for (const [k, v] of jar) out.push(`${k}=${v}`);
    return out.length ? out.join("; ") : undefined;
  };
  const captureSetCookies = (headers) => {
    // Headers#getSetCookie is the only non-deprecated multi-value reader; older
    // runtimes expose a single `set-cookie` instead. Both are tolerated.
    const all = typeof headers.getSetCookie === "function" ? headers.getSetCookie() : [];
    if (all.length === 0) {
      const single = headers.get("set-cookie");
      if (single) all.push(single);
    }
    for (const line of all) {
      const semi = line.indexOf(";");
      const pair = semi < 0 ? line : line.slice(0, semi);
      const eq = pair.indexOf("=");
      if (eq <= 0) continue;
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      if (name === "fera_ps" || name === "__Host-fera_ps") jar.set(name, value);
    }
  };

  const clientSubmissionId = randomUUID();
  const body = buildSyntheticCreateMissingRequest(clientSubmissionId);
  const postRes = await fetchOnce(origin, "/api/cases", fetchImpl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      ...(cookieHeader() ? { cookie: cookieHeader() } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!postRes.ok) {
    return { name: "synthetic-submit", ok: false, detail: `fail (post ${postRes.reason})`, status: "error" };
  }
  if (postRes.status !== 201 && postRes.status !== 200) {
    return { name: "synthetic-submit", ok: false, detail: `fail (post status ${postRes.status})`, status: "error" };
  }
  captureSetCookies(postRes.headers);
  if (!jar.size) {
    return { name: "synthetic-submit", ok: false, detail: "fail (no parent session cookie)", status: "error" };
  }
  let created;
  try {
    created = JSON.parse(postRes.text);
  } catch {
    return { name: "synthetic-submit", ok: false, detail: "fail (post not JSON)", status: "error" };
  }
  if (!hasExactKeys(created, CREATE_MISSING_RESPONSE_KEYS) || typeof created.id !== "string" || typeof created.ref_code !== "string" || created.is_synthetic !== true) {
    return { name: "synthetic-submit", ok: false, detail: "fail (post shape)", status: "error" };
  }
  if (created.replayed !== false) {
    // A brand-new submission must not be marked replayed.
    return { name: "synthetic-submit", ok: false, detail: "fail (post not new)", status: "error" };
  }
  // Idempotence: replay the same `client_submission_id`. The route returns
  // 200 with `replayed: true` for an identical replay (createMissingResponseSchema).
  const replayRes = await fetchOnce(origin, "/api/cases", fetchImpl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      ...(cookieHeader() ? { cookie: cookieHeader() } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!replayRes.ok) {
    return { name: "synthetic-submit", ok: false, detail: `fail (replay ${replayRes.reason})`, status: "error" };
  }
  if (replayRes.status !== 200) {
    return { name: "synthetic-submit", ok: false, detail: `fail (replay status ${replayRes.status})`, status: "error" };
  }
  let replayed;
  try {
    replayed = JSON.parse(replayRes.text);
  } catch {
    return { name: "synthetic-submit", ok: false, detail: "fail (replay not JSON)", status: "error" };
  }
  if (!hasExactKeys(replayed, CREATE_MISSING_RESPONSE_KEYS) || replayed.replayed !== true || replayed.id !== created.id) {
    return { name: "synthetic-submit", ok: false, detail: "fail (replay not idempotent)", status: "error" };
  }

  // Owner read: GET /api/cases/{id} with the captured cookie. The per-role
  // projection returns an owner view; we assert the strict fields the script
  // is allowed to read (id, ref_code, kind, status, is_synthetic, version).
  const readRes = await fetchOnce(origin, `/api/cases/${encodeURIComponent(created.id)}`, fetchImpl, {
    method: "GET",
    headers: {
      accept: "application/json",
      ...(cookieHeader() ? { cookie: cookieHeader() } : {}),
    },
  });
  if (!readRes.ok) {
    return { name: "synthetic-submit", ok: false, detail: `fail (read ${readRes.reason})`, status: "error" };
  }
  if (readRes.status !== 200) {
    return { name: "synthetic-submit", ok: false, detail: `fail (read status ${readRes.status})`, status: "error" };
  }
  let ownerView;
  try {
    ownerView = JSON.parse(readRes.text);
  } catch {
    return { name: "synthetic-submit", ok: false, detail: "fail (read not JSON)", status: "error" };
  }
  if (
    !hasExactKeys(ownerView, OWNER_CASE_VIEW_KEYS) ||
    ownerView.id !== created.id ||
    ownerView.ref_code !== created.ref_code ||
    ownerView.kind !== "missing" ||
    ownerView.is_synthetic !== true ||
    typeof ownerView.version !== "number"
  ) {
    return { name: "synthetic-submit", ok: false, detail: "fail (owner view shape)", status: "error" };
  }
  // The owner view must never echo a child payload field the script asked for.
  if (ownerView.contact_phone !== undefined || ownerView.contact_phone_masked !== undefined) {
    return { name: "synthetic-submit", ok: false, detail: "fail (owner view leak)", status: "error" };
  }

  // Optional status read through API-018. The script never deletes or
  // mutates the report from an unsupported endpoint.
  if (options.withStatus === true) {
    const statusRes = await fetchOnce(origin, "/api/my-case", fetchImpl, {
      method: "GET",
      headers: {
        accept: "application/json",
        ...(cookieHeader() ? { cookie: cookieHeader() } : {}),
      },
    });
    if (!statusRes.ok) {
      return { name: "synthetic-submit", ok: false, detail: `fail (status ${statusRes.reason})`, status: "error" };
    }
    if (statusRes.status !== 200) {
      return { name: "synthetic-submit", ok: false, detail: `fail (status status ${statusRes.status})`, status: "error" };
    }
    let statusBody;
    try {
      statusBody = JSON.parse(statusRes.text);
    } catch {
      return { name: "synthetic-submit", ok: false, detail: "fail (status not JSON)", status: "error" };
    }
    if (
      !hasExactKeys(statusBody, MY_CASE_RESPONSE_KEYS) ||
      !Array.isArray(statusBody.reports) ||
      !statusBody.reports.every((report) => hasExactKeys(report, MY_CASE_REPORT_KEYS)) ||
      !statusBody.reports.some((report) => report.id === created.id)
    ) {
      return { name: "synthetic-submit", ok: false, detail: "fail (status missing case)", status: "error" };
    }
  }

  // Drop the in-memory cookie on the way out. Nothing was logged.
  jar.clear();
  return { name: "synthetic-submit", ok: true, detail: "ok (mutated, read back)", status: "passed" };
}

class SmokeUsageError extends Error {
  constructor(message) {
    super(message);
    this.name = "SmokeUsageError";
  }
}

function parseArgs(argv) {
  /** @type {{ baseUrl?: string, syntheticSubmit: boolean, withStatus: boolean, help: boolean }} */
  const opts = { syntheticSubmit: false, withStatus: false, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (typeof a !== "string") continue;
    if (a === "--synthetic-submit") {
      opts.syntheticSubmit = true;
      continue;
    }
    if (a === "--with-status") {
      opts.withStatus = true;
      continue;
    }
    if (a === "--help" || a === "-h") {
      opts.help = true;
      continue;
    }
    if (a === "--") continue;
    if (a.startsWith("--")) {
      // Do not echo the value back: it may carry a secret/token. The flag name
      // alone is enough for an operator to find the typo.
      throw new SmokeUsageError("unknown flag");
    }
    if (opts.baseUrl === undefined) {
      opts.baseUrl = a;
    } else {
      throw new SmokeUsageError("unexpected positional argument");
    }
  }
  return opts;
}

const USAGE = `usage: smoke.mjs [<base-url>] [--synthetic-submit] [--with-status]

  <base-url>           Origin to check; defaults to \$SMOKE_BASE_URL or http://127.0.0.1:3000.
                       Only http(s) origins are accepted; the URL must have no path.

  --synthetic-submit   OPT IN to a real synthetic parent submit through API-003.
                       Off by default: the check is reported as 'skipped' and
                       is never counted as a pass. When set, the health probe
                       must prove synthetic_only: true, and the target must
                       be a local loopback (127.x, ::1, localhost) unless the
                       operator sets FERA_SMOKE_ALLOW_NON_LOOPBACK=1.

  --with-status        When --synthetic-submit is set, also call GET /api/my-case
                       (API-018) and assert the new case is listed.

  -h, --help           Print this help and exit 0.

The script never logs cookies, headers, request bodies, or raw response
bodies. Failed checks carry a short fixed reason only. Exit 0 means every
non-skipped check passed; the synthetic-submit step is never counted as a
pass unless the operator opts in and the run actually mutates.`;

async function main(argv) {
  let parsed;
  try {
    parsed = parseArgs(argv);
  } catch (err) {
    process.stderr.write(`smoke: ${err instanceof SmokeUsageError ? err.message : "invalid arguments"}\n${USAGE}\n`);
    return 2;
  }
  if (parsed.help) {
    process.stdout.write(`${USAGE}\n`);
    return 0;
  }
  let origin;
  try {
    origin = safeOrigin(parsed.baseUrl || process.env.SMOKE_BASE_URL || DEFAULT_BASE_URL);
  } catch (err) {
    const usage = err instanceof SmokeUsageError;
    process.stderr.write(`smoke: ${usage ? err.message : "invalid arguments"}\n${USAGE}\n`);
    return 2;
  }
  let results;
  try {
    results = await runSmoke(origin, undefined, {
      syntheticSubmit: parsed.syntheticSubmit,
      withStatus: parsed.withStatus,
    });
  } catch {
    process.stderr.write("smoke: internal error\n");
    return 1;
  }
  // Print one line per check, fixed prefix, never includes payloads.
  for (const r of results) {
    const tag = r.status ? `[${r.status}] ` : "";
    process.stdout.write(`${r.name}: ${tag}${r.detail}\n`);
  }
  // Exit 0 iff every non-skipped check passed. A skipped step is never
  // counted as a pass and never as a fail.
  const counted = results.filter((r) => r.status !== "skipped");
  return counted.length > 0 && counted.every((r) => r.ok) ? 0 : 1;
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
