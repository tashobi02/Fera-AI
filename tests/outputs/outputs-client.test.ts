// TASK-024: API-006 client call, error mapping (D3 S-004: E-016, E-020, E-024), the
// output card state machine (COMP-030) and the status/matching mappings (COMP-033).
import { describe, expect, it } from "vitest";
import { ERROR_CATALOGUE, MATCHING_STATES, STATUS_GROUPS } from "@/contracts";
import { exampleOutputResponse } from "@/contracts/examples";
import {
  MATCHING_KEY,
  STATUS_KEY,
  canRetry,
  cardReducer,
  classifyOutputFailure,
  initialCardState,
  isLimit,
  outputFailureText,
  outputsAvailable,
  requestOutput,
  type FetchLike,
} from "@/lib/outputs-client";
import { locales } from "@/locales";

const CASE = "6b1f3c2a-4d5e-4f60-8a71-0000000000a1";
const poster = { ...exampleOutputResponse, type: "poster" as const };

function fakeFetch(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const impl: FetchLike = async (url, init) => {
    calls.push({ url, init });
    return new Response(
      body === undefined ? "not json" : JSON.stringify(body),
      { status, headers },
    );
  };
  return { impl, calls };
}

describe("requestOutput (API-006)", () => {
  it("POSTs { type } same-origin with no cache, and parses the strict response", async () => {
    const f = fakeFetch(200, poster);
    const r = await requestOutput(CASE, "poster", {
      fetchImpl: f.impl,
      online: () => true,
    });
    expect(r).toEqual({ kind: "ok", data: poster });
    expect(f.calls[0]!.url).toBe(`/api/cases/${CASE}/outputs`);
    expect(f.calls[0]!.init).toMatchObject({
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      body: JSON.stringify({ type: "poster" }),
    });
    expect(f.calls[0]!.init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("is E-024 without a request when the browser is offline", async () => {
    const f = fakeFetch(200, poster);
    expect(
      await requestOutput(CASE, "gd", {
        fetchImpl: f.impl,
        online: () => false,
      }),
    ).toEqual({ kind: "failed", failure: { id: "E-024", seconds: null } });
    expect(f.calls).toHaveLength(0);
  });

  it("is E-021 for a network rejection or timeout while online", async () => {
    const reject: FetchLike = async () => {
      throw new TypeError("fetch failed");
    };
    expect(
      await requestOutput(CASE, "gd", {
        fetchImpl: reject,
        online: () => true,
      }),
    ).toMatchObject({ failure: { id: "E-021" } });
    const hang: FetchLike = (_url, init) =>
      new Promise((_, rej) =>
        init?.signal?.addEventListener("abort", () =>
          rej(new DOMException("t", "TimeoutError")),
        ),
      );
    expect(
      await requestOutput(CASE, "gd", {
        fetchImpl: hang,
        online: () => true,
        timeoutMs: 5,
      }),
    ).toMatchObject({ failure: { id: "E-021" } });
  });

  it("refuses a response that is not the contract shape or not the requested type", async () => {
    expect(
      await requestOutput(CASE, "gd", {
        fetchImpl: fakeFetch(200, { ...poster, extra: 1 }).impl,
        online: () => true,
      }),
    ).toMatchObject({ failure: { id: "E-021" } });
    expect(
      await requestOutput(CASE, "gd", {
        fetchImpl: fakeFetch(200, poster).impl,
        online: () => true,
      }),
    ).toMatchObject({ failure: { id: "E-021" } });
    expect(
      await requestOutput(CASE, "gd", {
        fetchImpl: fakeFetch(200, undefined).impl,
        online: () => true,
      }),
    ).toMatchObject({ failure: { id: "E-021" } });
  });

  it.each([
    [422, { error: { id: "E-016" } }, "E-016"],
    [429, { error: { id: "E-020" } }, "E-020"],
    [404, { error: { id: "E-004" } }, "E-004"],
    [401, { error: { id: "E-002" } }, "E-019"], // parents have no account: an expired cookie
    [500, { error: { id: "E-099" } }, "E-021"],
    [503, undefined, "E-021"],
  ])("maps HTTP %i to %s… → %s", async (status, body, id) => {
    expect(
      await requestOutput(CASE, "gd", {
        fetchImpl: fakeFetch(status, body).impl,
        online: () => true,
      }),
    ).toEqual({ kind: "failed", failure: { id, seconds: null } });
  });

  it("keeps a valid Retry-After for E-007 and ignores a bad one", () => {
    expect(
      classifyOutputFailure({
        status: 429,
        body: { error: { id: "E-007" } },
        retryAfter: "30",
      }),
    ).toEqual({ id: "E-007", seconds: 30 });
    expect(
      classifyOutputFailure({
        status: 429,
        retryAfter: "Wed, 21 Oct 2026 07:28:00 GMT",
      }),
    ).toEqual({ id: "E-007", seconds: null });
    expect(
      classifyOutputFailure({ status: 400, body: { error: { id: "E-024" } } })
        .id,
    ).toBe("E-021"); // client-only ID never from a body
  });
});

describe("failure copy", () => {
  it("comes from the catalogue, with Bangla numerals for seconds", () => {
    expect(outputFailureText({ id: "E-016", seconds: null }, "bn")).toBe(
      ERROR_CATALOGUE["E-016"].bn,
    );
    expect(outputFailureText({ id: "E-024", seconds: null }, "en")).toBe(
      ERROR_CATALOGUE["E-024"].en,
    );
    expect(outputFailureText({ id: "E-007", seconds: 30 }, "bn")).toContain(
      "৩০",
    );
    expect(outputFailureText({ id: "E-007", seconds: null }, "en")).toBe(
      locales.en.signInErrorRateLimitedSoon,
    );
  });

  it("offers retry except where retrying cannot help; E-020/E-007 are 'limit reached'", () => {
    expect(canRetry({ id: "E-016", seconds: null })).toBe(true);
    expect(canRetry({ id: "E-024", seconds: null })).toBe(true);
    for (const id of ["E-004", "E-019", "E-020"] as const)
      expect(canRetry({ id, seconds: null })).toBe(false);
    expect(isLimit({ id: "E-020", seconds: null })).toBe(true);
    expect(isLimit({ id: "E-016", seconds: null })).toBe(false);
  });
});

describe("output card state machine", () => {
  const ok = { kind: "ok" as const, data: poster };
  it("idle → loading → ready → copied, ignoring repeats", () => {
    const loading = cardReducer(initialCardState, { type: "request" });
    expect(loading).toEqual({ status: "loading" });
    expect(cardReducer(loading, { type: "request" })).toBe(loading);
    const ready = cardReducer(loading, { type: "outcome", outcome: ok });
    expect(ready).toEqual({ status: "ready", output: poster, copies: 0 });
    expect(cardReducer(ready, { type: "request" })).toBe(ready);
    const copied = cardReducer(cardReducer(ready, { type: "copied" }), {
      type: "copied",
    });
    expect(copied).toMatchObject({ copies: 2 });
  });

  it("records a failure, allows a retry, and ignores a stray outcome", () => {
    const failed = cardReducer(
      { status: "loading" },
      {
        type: "outcome",
        outcome: { kind: "failed", failure: { id: "E-016", seconds: null } },
      },
    );
    expect(failed).toEqual({
      status: "failed",
      failure: { id: "E-016", seconds: null },
    });
    expect(cardReducer(failed, { type: "request" })).toEqual({
      status: "loading",
    });
    expect(
      cardReducer(initialCardState, { type: "outcome", outcome: ok }),
    ).toBe(initialCardState);
    expect(cardReducer(failed, { type: "copied" })).toBe(failed);
  });
});

describe("status badge and matching line", () => {
  it("has D3 labels for every status group and D4 wording for every matching state", () => {
    expect(STATUS_GROUPS.map((g) => locales.bn[STATUS_KEY[g]])).toEqual([
      "খোলা",
      "যাচাই চলছে",
      "বন্ধ",
    ]);
    expect(STATUS_GROUPS.map((g) => locales.en[STATUS_KEY[g]])).toEqual([
      "Open",
      "Being checked",
      "Closed",
    ]);
    for (const m of MATCHING_STATES)
      expect(locales.bn[MATCHING_KEY[m]]).toBeTruthy();
    expect(locales.bn[MATCHING_KEY.queued]).toBe("মিল খোঁজা হবে");
    expect(locales.bn[MATCHING_KEY.failed]).toBe(
      "প্রতিবেদন জমা হয়েছে। মিল খোঁজা সম্পূর্ণ হয়নি; আবার চেষ্টা করুন।",
    );
  });

  it("offers outputs only while the owner view is editable and still has its draft (OD-023-2)", () => {
    expect(outputsAvailable({ editable: true, hasDraft: true })).toBe(true);
    expect(outputsAvailable({ editable: false, hasDraft: true })).toBe(false);
    expect(outputsAvailable({ editable: true, hasDraft: false })).toBe(false);
  });
});
