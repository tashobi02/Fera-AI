// Pre-main test-journeys — unit tests for the network watchdog helpers.
//
// The watchdog (`tests/rehearsal/network-watchdog.ts`) is consumed
// only by Playwright at test time, but its pure helpers
// (`classifyUrl`, `summarize`, `assertNoExternalAttempts`) are
// small enough to unit-test and are the contract that determines
// whether a run is "offline" or not. Asserting them in vitest
// catches regressions in the allowlist before they reach the
// Playwright runtime.
//
// The Playwright `installNetworkWatchdog` function is not re-imported
// here (it requires a live `BrowserContext`); the unit tests cover
// the deterministic decision helpers.

import { describe, it, expect } from "vitest";
import {
  classifyUrl,
  summarize,
  assertNoExternalAttempts,
  LOOPBACK_HOSTS,
  type RequestRecord,
} from "./network-watchdog";

describe("LOOPBACK_HOSTS", () => {
  it("contains 127.0.0.1, localhost, ::1 and the bracketed [::1] hostname form", () => {
    expect(LOOPBACK_HOSTS.has("127.0.0.1")).toBe(true);
    expect(LOOPBACK_HOSTS.has("localhost")).toBe(true);
    expect(LOOPBACK_HOSTS.has("::1")).toBe(true);
    expect(LOOPBACK_HOSTS.has("[::1]")).toBe(true);
  });
  it("does NOT contain an external host", () => {
    expect(LOOPBACK_HOSTS.has("0.0.0.0")).toBe(false);
    expect(LOOPBACK_HOSTS.has("example.com")).toBe(false);
    expect(LOOPBACK_HOSTS.has("8.8.8.8")).toBe(false);
  });
});

describe("classifyUrl", () => {
  it("allows http(s) loopback", () => {
    const a = classifyUrl("http://127.0.0.1:3225/api/health");
    expect(a.allow).toBe(true);
    expect(a.host).toBe("127.0.0.1");
    expect(a.scheme).toBe("http");
    expect(a.port).toBe(3225);
    const b = classifyUrl("https://localhost/foo");
    expect(b.allow).toBe(true);
    expect(b.host).toBe("localhost");
    // WHATWG URL keeps the brackets on an IPv6 hostname.
    const c = classifyUrl("http://[::1]:3225/");
    expect(c.allow).toBe(true);
    expect(c.host).toBe("[::1]");
  });
  it("denies http(s) to non-loopback hosts", () => {
    const a = classifyUrl("http://example.com/x");
    expect(a.allow).toBe(false);
    expect(a.host).toBe("example.com");
    const b = classifyUrl("https://8.8.8.8/");
    expect(b.allow).toBe(false);
    expect(b.host).toBe("8.8.8.8");
  });
  it("passes through data:, blob:, about:, chrome:, chrome-extension:, devtools:", () => {
    for (const scheme of ["data", "blob", "about", "chrome", "chrome-extension", "devtools"]) {
      const v = classifyUrl(`${scheme}:foo`);
      expect(v.allow, scheme).toBe(true);
      expect(v.scheme, scheme).toBe(scheme);
    }
  });
  it("denies unknown schemes (ws:, file:, ftp:)", () => {
    expect(classifyUrl("ws://example.com").allow).toBe(false);
    expect(classifyUrl("file:///etc/passwd").allow).toBe(false);
    expect(classifyUrl("ftp://example.com").allow).toBe(false);
  });
  it("denies a malformed URL (refuses to let it bypass the allowlist)", () => {
    expect(classifyUrl("not a url").allow).toBe(false);
    expect(classifyUrl("").allow).toBe(false);
  });
});

describe("summarize", () => {
  it("groups by host and computes totals", () => {
    const records: RequestRecord[] = [
      mk("allow", "http://127.0.0.1:3225/a", "127.0.0.1", "http"),
      mk("allow", "http://127.0.0.1:3225/b", "127.0.0.1", "http"),
      mk("deny", "http://example.com/x", "example.com", "http"),
      mk("pass", "data:image/png;base64,xx", "", "data"),
      mk("error", "http://127.0.0.1:3225/c", "127.0.0.1", "http", "Target page, context or browser has been closed"),
    ];
    const s = summarize(records);
    expect(s.totals.allow).toBe(2);
    expect(s.totals.deny).toBe(1);
    expect(s.totals.pass).toBe(1);
    expect(s.totals.error).toBe(1);
    const hosts = new Map(s.byHost.map((r) => [r.key, r]));
    expect(hosts.get("127.0.0.1")?.allow).toBe(2);
    expect(hosts.get("127.0.0.1")?.error).toBe(1);
    expect(hosts.get("example.com")?.deny).toBe(1);
    expect(hosts.get("(non-http)")?.pass).toBe(1);
  });
  it("returns zero counts for an empty record buffer", () => {
    const s = summarize([]);
    expect(s.totals).toEqual({ allow: 0, deny: 0, pass: 0, error: 0 });
    expect(s.byHost).toEqual([]);
  });
});

describe("assertNoExternalAttempts", () => {
  it("passes when no row has decision=deny (a loopback continue error is not external)", () => {
    const records: RequestRecord[] = [
      mk("allow", "http://127.0.0.1/x", "127.0.0.1", "http"),
      mk("error", "http://127.0.0.1/y", "127.0.0.1", "http", "context closed"),
    ];
    expect(() => assertNoExternalAttempts(records, "test")).not.toThrow();
  });
  it("fails when an external request was aborted", () => {
    const records: RequestRecord[] = [
      mk("deny", "http://example.com/x", "example.com", "http", "aborted"),
    ];
    expect(() => assertNoExternalAttempts(records, "test")).toThrow(/external request attempt/);
  });
  it("fails when an external request's route.abort itself failed", () => {
    const records: RequestRecord[] = [
      mk("deny", "http://example.com/x", "example.com", "http", "context closed"),
    ];
    expect(() => assertNoExternalAttempts(records, "test")).toThrow(/1 external request attempt/);
  });
});

function mk(
  decision: RequestRecord["decision"],
  url: string,
  host: string,
  scheme: string,
  outcome: string = "ok",
): RequestRecord {
  return {
    url,
    host,
    scheme,
    method: "GET",
    resourceType: "document",
    decision,
    outcome,
    port: null,
    at: 0,
  };
}
