// Request helpers: client address normalisation and proxy trust, multipart cap (API-001),
// same-origin scheme check and client request ID.
import { describe, expect, it } from "vitest";
import { LIMITS } from "@/contracts";
import {
  ApiError,
  clientAddress,
  clientRequestId,
  isSameOrigin,
  normaliseAddress,
  readMultipart,
  trustProxyFromEnv,
} from "@/app/api/_shared";

const req = (headers: Record<string, string>, init: RequestInit = {}, url = "http://fera.test/api/x") =>
  new Request(url, { ...init, headers });

async function errorOf(p: Promise<unknown>): Promise<ApiError> {
  try {
    await p;
  } catch (e) {
    if (e instanceof ApiError) return e;
    throw e;
  }
  throw new Error("expected an ApiError");
}

describe("normaliseAddress", () => {
  it.each([
    ["203.0.113.7", "203.0.113.7"],
    [" 203.0.113.7 ", "203.0.113.7"],
    ["::ffff:203.0.113.7", "203.0.113.7"],
    ["::ffff:cb00:7107", "203.0.113.7"],
    ["2001:db8:1:2:3:4:5:6", "2001:db8:1:2::/64"],
    ["2001:db8:1:2::99", "2001:db8:1:2::/64"],
    ["2001:DB8:0001:0002:ffff::1", "2001:db8:1:2::/64"],
    ["fe80::1%eth0", "fe80:0:0:0::/64"],
    ["::1", "0:0:0:0::/64"],
  ])("%s → %s", (raw, out) => {
    expect(normaliseAddress(raw)).toBe(out);
  });

  it.each([["not-an-ip"], ["999.1.1.1"], ["203.0.113.7:443"], ["[::1]"], [""], ["01712345678"]])("rejects %j", (raw) => {
    expect(normaliseAddress(raw)).toBeNull();
  });

  it("groups one IPv6 /64 into one subscriber", () => {
    expect(normaliseAddress("2001:db8:aa:bb::1")).toBe(normaliseAddress("2001:db8:aa:bb:ffff:ffff:ffff:ffff"));
    expect(normaliseAddress("2001:db8:aa:bb::1")).not.toBe(normaliseAddress("2001:db8:aa:bc::1"));
  });
});

describe("clientAddress and proxy trust", () => {
  it("trusts x-forwarded-for only behind a proxy", () => {
    const r = req({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" });
    expect(clientAddress(r, true)).toBe("203.0.113.7");
    expect(clientAddress(r, false)).toBeNull();
    expect(clientAddress(req({ "x-real-ip": "198.51.100.2" }), true)).toBe("198.51.100.2");
    expect(clientAddress(req({}), true)).toBeNull();
  });

  it("reads TRUST_PROXY=1 or VERCEL", () => {
    expect(trustProxyFromEnv({})).toBe(false);
    expect(trustProxyFromEnv({ TRUST_PROXY: "1" })).toBe(true);
    expect(trustProxyFromEnv({ TRUST_PROXY: "true" })).toBe(false);
    expect(trustProxyFromEnv({ VERCEL: "1" })).toBe(true);
  });
});

describe("isSameOrigin fallback compares scheme and host", () => {
  it.each([
    ["http://fera.test", "http://fera.test/api/x", true],
    ["https://fera.test", "http://fera.test/api/x", false],
    ["http://fera.test", "https://fera.test/api/x", false],
    ["https://fera.test", "https://fera.test/api/x", true],
    ["null", "http://fera.test/api/x", false],
  ] as const)("Origin %s on %s → %s", (origin, url, expected) => {
    expect(isSameOrigin(req({ host: "fera.test", origin }, { method: "POST" }, url))).toBe(expected);
  });
});

describe("clientRequestId", () => {
  it("returns a lowercased UUID or nothing", () => {
    expect(clientRequestId(req({ "x-request-id": "0B9F6A1E-3C4D-4E5F-8A7B-9C0D1E2F3A4B" }))).toBe("0b9f6a1e-3c4d-4e5f-8a7b-9c0d1e2f3a4b");
    expect(clientRequestId(req({ "x-request-id": "01712345678" }))).toBeUndefined();
    expect(clientRequestId(req({}))).toBeUndefined();
  });
});

describe("readMultipart (API-001, D2A §9.4)", () => {
  const form = (bytes: number) => {
    const f = new FormData();
    f.set("kind", "missing");
    f.set("audio", new Blob([new Uint8Array(bytes)], { type: "audio/webm" }), "note.webm");
    return f;
  };
  const post = async (f: FormData, extra: Record<string, string> = {}) => {
    const encoded = new Response(f);
    return new Request("http://fera.test/api/intake/transcribe", {
      method: "POST",
      headers: { "content-type": encoded.headers.get("content-type")!, ...extra },
      body: await encoded.arrayBuffer(),
    });
  };

  it("parses a form within the cap", async () => {
    const data = await readMultipart(await post(form(1024)));
    expect(data.get("kind")).toBe("missing");
    expect((data.get("audio") as File).size).toBe(1024);
  });

  it("audio up to the 2 MB limit fits within the cap", async () => {
    const data = await readMultipart(await post(form(LIMITS.audioMaxBytes)));
    expect((data.get("audio") as File).size).toBe(LIMITS.audioMaxBytes);
  });

  it("an oversize body is E-008 (reason too_large), streamed or declared", async () => {
    const big = await post(form(LIMITS.audioMaxBytes + 20 * 1024));
    expect(await errorOf(readMultipart(big))).toMatchObject({ id: "E-008", reason: "too_large" });
    const declared = await post(form(10), { "content-length": String(LIMITS.audioMaxBytes * 2) });
    expect(await errorOf(readMultipart(declared))).toMatchObject({ id: "E-008", reason: "too_large" });
  });

  it("can report oversize as E-001 instead", async () => {
    const big = await post(form(2048));
    expect(await errorOf(readMultipart(big, { maxBytes: 1024, tooLarge: "E-001" }))).toMatchObject({ id: "E-001" });
  });

  it("a wrong content type or broken body is E-001", async () => {
    const json = new Request("http://fera.test/x", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    expect(await errorOf(readMultipart(json))).toMatchObject({ id: "E-001", reason: "content_type" });
    const broken = new Request("http://fera.test/x", {
      method: "POST",
      headers: { "content-type": "multipart/form-data; boundary=abc" },
      body: "not a multipart body",
    });
    expect(await errorOf(readMultipart(broken))).toMatchObject({ id: "E-001", reason: "multipart" });
  });
});
