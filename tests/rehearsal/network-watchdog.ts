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
//      localhost, and the IPv6 loopback in both `::1` and the
//      bracketed `[::1]` hostname form WHATWG URL produces), and
//   3) records the provenance of every URL the browser attempts,
//      so the spec can assert (a) zero external attempts and (b) the
//      per-host/per-status counts for evidence.
//
// Scope, stated exactly: this watchdog observes and blocks
// BROWSER-ORIGINATED HTTP(S) requests that Playwright routes through
// `context.route` (documents, scripts, fetch/XHR from pages). It does
// NOT observe server-side egress from the Next.js process, Node
// `fetch` calls made by the spec itself, the Playwright `request`
// fixture / `context.request` API, or WebSocket traffic beyond what
// Playwright's routing covers. Service workers are blocked in
// `playwright.offline.config.ts` so their requests cannot bypass
// routing. A zero count here is evidence about the browser only.
//
// The handler is installed at `context` scope (not `page` scope) so it
// covers the navigation that follows, not just the page that triggered
// the install. It survives cross-page navigation (parent review →
// status → edit, etc.) without re-installation per page.
//
// Loopback hosts are passed through (the test exercises the app
// through them). The data URL scheme (fonts, images) is also allowed;
// this is required for the design tokens bundled in `public/` to
// render. The chromium-extension scheme is allowed for Playwright's
// own metadata; the brief asks for "external hosts", not local
// extensions.
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
  /** "allow" (loopback), "deny" (external host), "pass" (allowed
   *  non-http scheme) or "error" (an allowed loopback request whose
   *  `route.continue()` threw, e.g. the context closed). Every "deny"
   *  row is an external attempt, whatever its outcome. */
  decision: "allow" | "deny" | "pass" | "error";
  /** "ok" if the route call returned without throwing, "aborted" if a
   *  deny was aborted, otherwise the thrown error message. */
  outcome: "ok" | "aborted" | string;
  /** The port number, when present and parseable; null otherwise. */
  port: number | null;
  /** Wall-clock time (ms since epoch) when the handler decided. */
  at: number;
};

/** Loopback host allowlist. Anything else is denied. */
// `new URL("http://[::1]:3225/").hostname` is "[::1]" (brackets kept),
// so both spellings are listed.
export const LOOPBACK_HOSTS = new Set<string>(["127.0.0.1", "localhost", "::1", "[::1]"]);
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
 *  per-test contexts. Both the init script and the route are awaited,
 *  so no navigation can start before the watchdog is in place. */
export async function installNetworkWatchdog(context: BrowserContext, shared?: RequestRecord[]): Promise<RequestRecord[]> {
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
  await context.addInitScript(() => {
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
  await context.route("**/*", async (route: Route, request: Request) => {
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
      const row: RequestRecord = { ...base, decision: verdict.scheme === "http" || verdict.scheme === "https" ? "allow" : "pass", outcome: "ok" };
      records.push(row);
      shared?.push(row);
      try {
        await route.continue();
      } catch (err) {
        // A failed loopback continue is not an external attempt; it is
        // recorded as its own decision so it is never mistaken for one.
        row.decision = "error";
        row.outcome = describeAbort(err);
      }
      return;
    }
    const denyRow: RequestRecord = { ...base, decision: "deny", outcome: "aborted" };
    records.push(denyRow);
    shared?.push(denyRow);
    try {
      await route.abort("blockedbyclient");
    } catch (err) {
      // The attempt still counts as external (see assertNoExternalAttempts);
      // only the outcome changes.
      denyRow.outcome = describeAbort(err);
    }
  });
  return records;
}

/** Throw a short, structured message if any non-loopback URL was
 *  attempted. Every "deny" row counts, whatever its outcome: a failed
 *  `route.abort` is still an external attempt and must not pass. The
 *  spec calls this after every test and at the end of the suite. */
export function assertNoExternalAttempts(records: RequestRecord[], label: string): void {
  const external = records.filter((r) => r.decision === "deny");
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
  byHost: Array<{ key: string; allow: number; deny: number; pass: number; error: number }>;
  totals: { allow: number; deny: number; pass: number; error: number };
} {
  const map = new Map<string, { allow: number; deny: number; pass: number; error: number }>();
  for (const r of records) {
    const key = r.host || "(non-http)";
    const entry = map.get(key) ?? { allow: 0, deny: 0, pass: 0, error: 0 };
    entry[r.decision] += 1;
    map.set(key, entry);
  }
  const byHost = Array.from(map.entries())
    .map(([key, v]) => ({ key, ...v }))
    .sort((a, b) => b.allow + b.deny + b.pass + b.error - (a.allow + a.deny + a.pass + a.error));
  const totals = { allow: 0, deny: 0, pass: 0, error: 0 };
  for (const row of byHost) {
    totals.allow += row.allow;
    totals.deny += row.deny;
    totals.pass += row.pass;
    totals.error += row.error;
  }
  return { byHost, totals };
}

function describeAbort(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
