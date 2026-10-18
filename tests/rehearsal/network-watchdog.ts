// Pre-main test-journeys — offline network watchdog.
//
// Single point that:
//   1) installs a `context.addInitScript` that pins
//      `navigator.onLine` to `false` and swallows any `online` event
//      the app (or a library) tries to dispatch, so the app's own
//      client-side offline guards run their offline branch even
//      though the test webServer is actually serving on loopback;
//   2) installs a `context.route` handler that ABORTS every request
//      whose URL host is outside the loopback allowlist (127.0.0.1,
//      localhost, ::1, and the IPv6 loopback equivalent), and
//   3) records the provenance of every URL the browser attempts,
//      so the spec can assert (a) zero external attempts and (b) the
//      per-host/per-status counts for evidence.
//
// The allowlist is the only definition of "offline" in this run. The
// spec never trusts a comment claiming the app is offline; it asserts
// the allowlist is enforced and the recorded counts are correct.
//
// The handler is installed at `context` scope (not `page` scope) so it
// covers the navigation that follows, not just the page that triggered
// the install. It survives cross-page navigation (parent review →
// status → edit, etc.) without re-installation per page.
//
// Hosts under `127.0.0.1` / `localhost` / `::1` are passed through
// (the test exercises the app through them). The data URL scheme
// (fonts, images) is also allowed; this is required for the design
// tokens bundled in `public/` to render. The chromium-extension
// scheme is allowed for Playwright's own metadata; the brief asks
// for "external hosts", not local extensions.
//
// `blob:` URLs are produced by the app itself (object URLs for the
// voice recorder, etc.) and never reach outside; they are allowed.

import { strict as assert } from "node:assert";
import type { BrowserContext, Request, Route } from "@playwright/test";

export type RequestRecord = {
  /** Original URL string the browser attempted. */
  url: string;
  /** Lowercased host, or "" for relative / data / blob URLs. */
  host: string;
  /** Lowercased scheme; one of http, https, data, blob, about, ... */
  scheme: string;
  /** HTTP method (GET, POST, ...). For data URLs this is "GET". */
  method: string;
  /** Resource type from Playwright (document, script, image, ...). */
  resourceType: string;
  /** "allow" (loopback), "deny" (external host) or "pass" (allowed
   *  non-http scheme). "deny" rows are the proof the route ran. */
  decision: "allow" | "deny" | "pass";
  /** "ok" if the route handler returned without throwing, otherwise
   *  the abort reason. */
  outcome: "ok" | "aborted" | string;
  /** The port number, when present and parseable; null otherwise. */
  port: number | null;
  /** Wall-clock time (ms since epoch) when the handler decided. */
  at: number;
};

/** Loopback host allowlist. Anything else is denied. */
export const LOOPBACK_HOSTS = new Set<string>(["127.0.0.1", "localhost", "::1"]);
/** Non-http schemes the browser attempts; all passed through. The
 *  allowlist deliberately does NOT include http/https; those go
 *  through the host check. */
const PASS_THROUGH_SCHEMES = new Set<string>(["data", "blob", "about", "chrome", "chrome-extension", "devtools"]);

/** Decide whether a URL is allowed. Internal so a spec can reuse it
 *  for non-route assertions (e.g. asserting `Host:` headers). */
export function classifyUrl(raw: string): { allow: boolean; host: string; scheme: string; port: number | null } {
  // Be defensive: a malformed URL must NOT bypass the allowlist; it is
  // denied and the spec records the attempt.
  let host = "";
  let scheme = "";
  let port: number | null = null;
  try {
    const u = new URL(raw);
    scheme = u.protocol.replace(/:$/, "").toLowerCase();
    host = u.hostname.toLowerCase();
    port = u.port ? Number(u.port) : null;
  } catch {
    return { allow: false, host: "", scheme: "", port: null };
  }
  if (PASS_THROUGH_SCHEMES.has(scheme)) {
    return { allow: true, host, scheme, port };
  }
  if (scheme !== "http" && scheme !== "https") {
    // Unknown scheme (ws:, file:, ...). Refuse by default.
    return { allow: false, host, scheme, port };
  }
  return { allow: LOOPBACK_HOSTS.has(host), host, scheme, port };
}

/** Install the deny handler on the given context and return a mutable
 *  record buffer. The buffer is the same instance for the lifetime of
 *  the context. If `shared` is provided, every record is also pushed
 *  into it so a suite-level buffer survives across Playwright's
 *  per-test contexts. */
export function installNetworkWatchdog(context: BrowserContext, shared?: RequestRecord[]): RequestRecord[] {
  const records: RequestRecord[] = [];
  // (1) Pin `navigator.onLine` to false BEFORE any page script runs.
  // The brief calls for an initScript that overrides the navigator
  // online flag: the app code paths that read `navigator.onLine` (e.g.
  // SCREEN-009 retry buttons, officer "no network" affordances) must
  // see `false` even though the test webServer is actually serving on
  // loopback. The `context.route` handler below is the *real* offline
  // enforcement; this initScript is the navigator-truth that makes the
  // app's own client-side guards run their offline branch. We also
  // short-circuit `window.online` / `window.offline` event dispatch so
  // a frame that calls `dispatchEvent(new Event('online'))` cannot
  // silently flip the indicator back. The initScript is installed at
  // context scope so it covers every page that opens under the
  // context, not just the first one.
  context.addInitScript(() => {
    // Object.defineProperty on the prototype is the only way the
    // override survives reads from frames, workers, and any code
    // path that grabbed a reference at module-load time.
    try {
      Object.defineProperty(Navigator.prototype, "onLine", {
        configurable: true,
        get() {
          return false;
        },
        set() {
          // ignore any write that would flip us back to "online"
        },
      });
    } catch {
      // Some test pages override `navigator` itself; ignore.
    }
    // Listen / dispatch interlock: even if app code calls
    // `window.dispatchEvent(new Event('online'))`, we swallow the
    // event and re-emit 'offline' so listeners that toggle UI
    // affordances stay in the offline state.
    const swallow = (ev: Event) => {
      if (ev.type === "online") {
        ev.stopImmediatePropagation();
        ev.preventDefault();
        try {
          window.dispatchEvent(new Event("offline"));
        } catch {
          /* dispatch may throw in detached docs; ignore */
        }
      }
    };
    window.addEventListener("online", swallow, { capture: true });
    // Some libraries bind to `document` for readyState probes; cover
    // both.
    document.addEventListener("online", swallow, { capture: true });
  });
  // `context.route` accepts a glob. The URL filter is the function form:
  // everything is matched, the handler classifies per-request.
  context.route("**/*", async (route: Route, request: Request) => {
    const url = request.url();
    const verdict = classifyUrl(url);
    const at = Date.now();
    const base = {
      url,
      host: verdict.host,
      scheme: verdict.scheme,
      method: request.method(),
      resourceType: request.resourceType(),
      port: verdict.port,
      at,
    };
    if (verdict.allow) {
      const row = { ...base, decision: verdict.scheme === "http" || verdict.scheme === "https" ? ("allow" as const) : ("pass" as const), outcome: "ok" };
      records.push(row);
      shared?.push(row);
      try {
        await route.continue();
      } catch (err) {
        const errRow = { ...base, decision: "deny" as const, outcome: describeAbort(err) };
        records.push(errRow);
        shared?.push(errRow);
      }
      return;
    }
    const denyRow = { ...base, decision: "deny" as const, outcome: "aborted" };
    records.push(denyRow);
    shared?.push(denyRow);
    try {
      await route.abort("blockedbyclient");
    } catch (err) {
      const errRow = { ...base, decision: "deny" as const, outcome: describeAbort(err) };
      records.push(errRow);
      shared?.push(errRow);
    }
  });
  return records;
}

/** Throw a short, structured message if any non-loopback URL was
 *  attempted during the run. The spec calls this at the end of each
 *  journey and at the end of the full suite. */
export function assertNoExternalAttempts(records: RequestRecord[], label: string): void {
  const denied = records.filter((r) => r.decision === "deny");
  // The deny rows include any errored `route.continue` (e.g. context
  // closed) — those are recorded for evidence but not classified as
  // "external attempts". Only `outcome === "aborted"` rows are external.
  const external = denied.filter((r) => r.outcome === "aborted");
  assert.equal(
    external.length,
    0,
    `${label}: ${external.length} external request attempt(s) recorded: ${JSON.stringify(external.slice(0, 5))}`,
  );
}

/** Group by host+scheme+port for the evidence summary. Counts are
 *  computed once per call; the spec snapshots them so the report is
 *  stable across the test runtime. */
export function summarize(records: RequestRecord[]): {
  byHost: Array<{ key: string; allow: number; deny: number; pass: number }>;
  totals: { allow: number; deny: number; pass: number };
} {
  const map = new Map<string, { allow: number; deny: number; pass: number }>();
  for (const r of records) {
    const key = r.host || "(non-http)";
    const entry = map.get(key) ?? { allow: 0, deny: 0, pass: 0 };
    if (r.decision === "allow") entry.allow += 1;
    else if (r.decision === "deny") entry.deny += 1;
    else entry.pass += 1;
    map.set(key, entry);
  }
  const byHost = Array.from(map.entries())
    .map(([key, v]) => ({ key, ...v }))
    .sort((a, b) => b.allow + b.deny + b.pass - (a.allow + a.deny + a.pass));
  const totals = { allow: 0, deny: 0, pass: 0 };
  for (const row of byHost) {
    totals.allow += row.allow;
    totals.deny += row.deny;
    totals.pass += row.pass;
  }
  return { byHost, totals };
}

function describeAbort(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
