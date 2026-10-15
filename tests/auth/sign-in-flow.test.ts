// TASK-031 review round 1: the COMP-047 submit state machine (src/lib/sign-in-flow.ts):
// validation, in-flight guard, API-020 outcomes (401, 429, network, timeout, non-JSON,
// success), password clearing and focus.
import { describe, expect, it, vi } from "vitest";
import { errorEnvelope } from "@/contracts";
import {
  SIGN_IN_API,
  clearsPassword,
  createInFlightGuard,
  focusAfter,
  initialSignInState,
  requestSignIn,
  signInReducer,
  validateSignIn,
  valuesFromFormData,
  type SignInOutcome,
  type SignInState,
} from "@/lib/sign-in-flow";

const ok = { username: "officer.demo", password: "synthetic-pass-123" };
const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
const fetchReturning = (res: Response | (() => Promise<Response>)) =>
  vi.fn(async () => (typeof res === "function" ? res() : res)) as unknown as typeof fetch;

describe("validation", () => {
  it("needs a non-blank username and a non-empty password; a password is never trimmed", () => {
    expect(validateSignIn(ok)).toEqual({ username: false, password: false });
    expect(validateSignIn({ username: "   ", password: "" })).toEqual({ username: true, password: true });
    expect(validateSignIn({ username: "a", password: " " })).toEqual({ username: false, password: false });
  });

  it("reads values from FormData, so autofilled fields count without an input event", () => {
    const data = new FormData();
    data.set("username", "staff.demo");
    data.set("password", "autofilled");
    expect(valuesFromFormData(data)).toEqual({ username: "staff.demo", password: "autofilled" });
    expect(valuesFromFormData(new FormData())).toEqual({ username: "", password: "" });
  });
});

describe("requestSignIn (API-020)", () => {
  it("posts JSON same-origin with a timeout signal", async () => {
    const fetchImpl = fetchReturning(json(200, { role: "staff", verified: false }));
    await requestSignIn(ok, { next: null, fetchImpl });
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe(SIGN_IN_API);
    expect(init).toMatchObject({ method: "POST", credentials: "same-origin", cache: "no-store" });
    expect(JSON.parse(String(init.body))).toEqual(ok);
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("success → the destination for the server-derived session", async () => {
    expect(await requestSignIn(ok, { next: "/officer", fetchImpl: fetchReturning(json(200, { role: "officer", verified: false })) })).toEqual({
      kind: "redirect",
      to: "/staff",
    });
    expect(await requestSignIn(ok, { next: "/officer/case/a", fetchImpl: fetchReturning(json(200, { role: "officer", verified: true })) })).toEqual({
      kind: "redirect",
      to: "/officer/case/a",
    });
  });

  it.each<[string, () => Promise<Response>, SignInOutcome]>([
    ["401 E-002", async () => json(401, errorEnvelope("E-002")), { kind: "failure", failure: { kind: "credentials" } }],
    ["429 E-007", async () => json(429, errorEnvelope("E-007", { seconds: 9 }), { "retry-after": "9" }), { kind: "failure", failure: { kind: "rate-limited", seconds: 9 } }],
    ["500 E-021", async () => json(500, errorEnvelope("E-021")), { kind: "failure", failure: { kind: "generic" } }],
    ["200 non-JSON", async () => new Response("<html>", { status: 200 }), { kind: "failure", failure: { kind: "generic" } }],
    ["200 wrong shape", async () => json(200, { role: "parent" }), { kind: "failure", failure: { kind: "generic" } }],
    ["network failure", async () => Promise.reject(new TypeError("Failed to fetch")), { kind: "failure", failure: { kind: "generic" } }],
  ])("%s", async (_, respond, expected) => {
    expect(await requestSignIn(ok, { next: null, fetchImpl: fetchReturning(respond) })).toEqual(expected);
  });

  it("gives up after the timeout with the generic failure", async () => {
    const hang = ((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => init.signal?.addEventListener("abort", () => reject(init.signal?.reason)))) as unknown as typeof fetch;
    const started = Date.now();
    expect(await requestSignIn(ok, { next: null, fetchImpl: hang, timeoutMs: 20 })).toEqual({ kind: "failure", failure: { kind: "generic" } });
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it("clears the password after every failure and focuses it after E-002 only", () => {
    const credentials: SignInOutcome = { kind: "failure", failure: { kind: "credentials" } };
    const limited: SignInOutcome = { kind: "failure", failure: { kind: "rate-limited", seconds: 5 } };
    const redirect: SignInOutcome = { kind: "redirect", to: "/staff" };
    expect([credentials, limited, redirect].map(clearsPassword)).toEqual([true, true, false]);
    expect([credentials, limited, redirect].map(focusAfter)).toEqual(["password", null, null]);
  });
});

describe("signInReducer", () => {
  const submitting = signInReducer(initialSignInState, { type: "submit", values: ok });

  it("marks missing fields as required and invalid, without starting a request", () => {
    const s = signInReducer(initialSignInState, { type: "submit", values: { username: "", password: "" } });
    expect(s).toMatchObject({ status: "idle", required: { username: true, password: true }, invalid: { username: true, password: true } });
  });

  it("starts a request and ignores a second submit while in flight or leaving", () => {
    expect(submitting.status).toBe("submitting");
    expect(signInReducer(submitting, { type: "submit", values: ok })).toBe(submitting);
    const leaving = signInReducer(submitting, { type: "outcome", outcome: { kind: "redirect", to: "/staff" } });
    expect(leaving.status).toBe("redirecting");
    expect(signInReducer(leaving, { type: "submit", values: ok })).toBe(leaving);
  });

  it("E-002 marks both fields invalid (never one), other failures neither", () => {
    const bad = signInReducer(submitting, { type: "outcome", outcome: { kind: "failure", failure: { kind: "credentials" } } });
    expect(bad).toMatchObject({ status: "idle", failure: { kind: "credentials" }, invalid: { username: true, password: true } });
    const limited = signInReducer(submitting, { type: "outcome", outcome: { kind: "failure", failure: { kind: "rate-limited", seconds: 3 } } });
    expect(limited.invalid).toEqual({ username: false, password: false });
  });

  it("clears a field's error and aria-invalid once it has a value, and only that field", () => {
    const missing = signInReducer(initialSignInState, { type: "submit", values: { username: "", password: "" } });
    expect(signInReducer(missing, { type: "input", field: "username", value: "" })).toBe(missing);
    const typed = signInReducer(missing, { type: "input", field: "username", value: "s" });
    expect(typed.required).toEqual({ username: false, password: true });
    expect(typed.invalid).toEqual({ username: false, password: true });
  });

  it("a new attempt clears the previous failure", () => {
    const bad: SignInState = { ...initialSignInState, failure: { kind: "credentials" }, invalid: { username: true, password: true } };
    expect(signInReducer(bad, { type: "submit", values: ok })).toMatchObject({ status: "submitting", failure: null });
  });

  it("demo fill records the username for the announcement and clears its error", () => {
    const missing = signInReducer(initialSignInState, { type: "submit", values: { username: "", password: "" } });
    const filled = signInReducer(missing, { type: "demo-fill", username: "staff.demo" });
    expect(filled).toMatchObject({ filled: "staff.demo", required: { username: false, password: true } });
  });

  it("a bfcache restore (pageshow) makes a busy form usable again", () => {
    const leaving = signInReducer(submitting, { type: "outcome", outcome: { kind: "redirect", to: "/staff" } });
    expect(signInReducer(leaving, { type: "pageshow" }).status).toBe("idle");
    expect(signInReducer(initialSignInState, { type: "pageshow" })).toBe(initialSignInState);
  });

  it("ignores an outcome that arrives when no request is in flight", () => {
    expect(signInReducer(initialSignInState, { type: "outcome", outcome: { kind: "redirect", to: "/x" } })).toBe(initialSignInState);
  });
});

describe("createInFlightGuard", () => {
  it("lets one submit in until it leaves", () => {
    const guard = createInFlightGuard();
    expect(guard.enter()).toBe(true);
    expect(guard.busy).toBe(true);
    expect(guard.enter()).toBe(false);
    guard.leave();
    expect(guard.enter()).toBe(true);
  });
});
