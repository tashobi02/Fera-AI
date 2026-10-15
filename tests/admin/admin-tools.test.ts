// TASK-032: SCREEN-013 pure helpers (src/lib/admin-tools.ts): the typed-confirmation
// guard, the redaction state machine, state/copy mapping and the API calls.
import { describe, expect, it } from "vitest";
import { ERROR_CATALOGUE, adminUserViewSchema, anonymiseRequestSchema } from "@/contracts";
import {
  REDACTION_CONFIRMATION,
  adminFailureText,
  canToggleVerification,
  classifyAdminFailure,
  confirmationMatches,
  initialRedactionState,
  redactionReducer,
  redactionSkippedText,
  redactionSuccessText,
  requestRedaction,
  requestUsersPage,
  requestVerification,
  userStatus,
  verifiedText,
  type FetchLike,
} from "@/lib/admin-tools";
import { locales } from "@/locales";

const OFFICER = "6b1f3c2a-4d5e-4f60-8a71-000000000021";
const ok = { redacted: 3, skipped_not_eligible: 1, mode: "pseudonymisation", external_copies_removed: false } as const;

function recordingFetch(status: number, body: unknown, headers: Record<string, string> = {}) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({ url, init });
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
  };
  return { calls, fetchImpl };
}

describe("typed confirmation guard (D3 SCREEN-013)", () => {
  it("is the word the API-016 contract accepts", () => {
    expect(REDACTION_CONFIRMATION).toBe("বেনামী");
    expect(anonymiseRequestSchema.safeParse({ all_eligible: true, confirmation: REDACTION_CONFIRMATION }).success).toBe(true);
  });

  it("accepts the exact word, forgiving surrounding space and NFD input", () => {
    expect(confirmationMatches("বেনামী")).toBe(true);
    expect(confirmationMatches("  বেনামী \n")).toBe(true);
    expect(confirmationMatches("বেনামী".normalize("NFD"))).toBe(true);
  });

  it.each(["", "বেনাম", "বেনামি", "বেনামী করুন", "benami", "BENAMI", "anonymise", "বে নামী"])("refuses %j", (value) => {
    expect(confirmationMatches(value)).toBe(false);
  });
});

describe("redaction state machine", () => {
  it("a mismatched word marks the input and sends nothing", () => {
    const s = redactionReducer(initialRedactionState, { type: "submit", value: "বেনাম" });
    expect(s).toEqual({ status: "idle", confirmError: true, result: null, failure: null });
  });

  it("typing the right word clears the mismatch; a wrong edit keeps it", () => {
    const bad = redactionReducer(initialRedactionState, { type: "submit", value: "x" });
    expect(redactionReducer(bad, { type: "input", value: "বে" }).confirmError).toBe(true);
    expect(redactionReducer(bad, { type: "input", value: "বেনামী" }).confirmError).toBe(false);
  });

  it("submits, ignores a second submit while busy, then records success or failure", () => {
    const busy = redactionReducer(initialRedactionState, { type: "submit", value: "বেনামী" });
    expect(busy.status).toBe("submitting");
    expect(redactionReducer(busy, { type: "submit", value: "বেনামী" })).toBe(busy);
    const done = redactionReducer(busy, { type: "outcome", outcome: { kind: "ok", data: ok } });
    expect(done).toEqual({ status: "idle", confirmError: false, result: ok, failure: null });
    const failed = redactionReducer(busy, { type: "outcome", outcome: { kind: "failed", failure: { id: "E-003", seconds: null } } });
    expect(failed).toEqual({ status: "idle", confirmError: false, result: null, failure: { id: "E-003", seconds: null } });
  });

  it("a new attempt clears the previous result; a stray outcome is ignored", () => {
    const done = { ...initialRedactionState, result: ok };
    expect(redactionReducer(done, { type: "submit", value: "বেনামী" }).result).toBeNull();
    expect(redactionReducer(initialRedactionState, { type: "outcome", outcome: { kind: "ok", data: ok } })).toBe(initialRedactionState);
  });
});

describe("copy mapping", () => {
  it("uses the exact D3 SCREEN-013 strings", () => {
    expect([locales.bn.redactAction, locales.en.redactAction]).toEqual(["বন্ধ কেস বেনামী করুন", "Redact identifying payloads from eligible terminal cases"]);
    expect([locales.bn.redactEmpty, locales.en.redactEmpty]).toEqual(["পরিচয় তথ্য অপসারণের জন্য উপযুক্ত রিপোর্ট নেই", "No eligible reports for payload redaction"]);
    expect([locales.bn.redactSuccess, locales.en.redactSuccess]).toEqual(["{n}টি রিপোর্টের পরিচয় তথ্য অপসারণ করা হয়েছে", "{n} cases payload-redacted"]);
  });

  it("fills the success count with Bangla numerals in Bangla mode", () => {
    expect(redactionSuccessText({ redacted: 12 }, "bn")).toBe("১২টি রিপোর্টের পরিচয় তথ্য অপসারণ করা হয়েছে");
    expect(redactionSuccessText({ redacted: 12 }, "en")).toBe("12 cases payload-redacted");
    expect(redactionSuccessText({ redacted: 0 }, "bn")).toBe("০টি রিপোর্টের পরিচয় তথ্য অপসারণ করা হয়েছে");
  });

  it("mentions skipped reports only when there are any", () => {
    expect(redactionSkippedText({ skipped_not_eligible: 0 }, "en")).toBeNull();
    expect(redactionSkippedText({ skipped_not_eligible: 2 }, "bn")).toMatch(/^২টি/);
    expect(redactionSkippedText({ skipped_not_eligible: 2 }, "en")).toMatch(/^2 reports skipped/);
  });

  it("never claims legal anonymisation and states the external-copy limit (D4 Admin row)", () => {
    for (const t of [locales.bn, locales.en]) {
      const all = [t.redactTitle, t.redactKeeps, t.redactExternal, t.redactEvidenceRule, t.redactSuccess, t.redactAction].join(" ");
      expect(all).not.toMatch(/legally|GDPR|compliant|আইনগত/i);
    }
    expect(locales.en.redactKeeps).toContain("pseudonymisation, not full anonymisation");
    expect(locales.en.redactExternal).toContain("not removed");
  });

  it("keeps [MOCK] in every verification outcome and the toggle labels", () => {
    expect(verifiedText("[MOCK] কর্মকর্তা", true, "bn")).toBe("[MOCK] কর্মকর্তা: যাচাইকৃত [MOCK]");
    expect(verifiedText("Officer", false, "en")).toBe("Officer: verification removed [MOCK]");
    expect(locales.bn.mockLabel).toBe("[MOCK]");
  });

  it("maps failures to the D2B catalogue copy, never to response text", () => {
    expect(adminFailureText({ id: "E-001", seconds: null }, "bn")).toBe(ERROR_CATALOGUE["E-001"].bn);
    expect(adminFailureText({ id: "E-003", seconds: null }, "en")).toBe(ERROR_CATALOGUE["E-003"].en);
    expect(adminFailureText({ id: "E-007", seconds: 42 }, "bn")).toBe("৪২ সেকেন্ড পরে আবার চেষ্টা করুন।");
    expect(adminFailureText({ id: "E-007", seconds: null }, "en")).toBe(locales.en.signInErrorRateLimitedSoon);
    const failure = classifyAdminFailure({ status: 403, body: { error: { id: "E-003", message_en: "<script>leak</script>" } } });
    expect(adminFailureText(failure, "en")).not.toContain("leak");
  });

  it("classifies by envelope ID, then by HTTP status, else E-021", () => {
    expect(classifyAdminFailure({ status: 400, body: { error: { id: "E-001" } } })).toEqual({ id: "E-001", seconds: null });
    expect(classifyAdminFailure({ status: 404, body: null })).toEqual({ id: "E-004", seconds: null });
    expect(classifyAdminFailure({ status: 401, body: "x" })).toEqual({ id: "E-002", seconds: null });
    expect(classifyAdminFailure({ status: 429, body: { error: { id: "E-007" } }, retryAfter: "30" })).toEqual({ id: "E-007", seconds: 30 });
    expect(classifyAdminFailure({ status: 429, retryAfter: "Wed, 21 Oct 2026 07:28:00 GMT" })).toEqual({ id: "E-007", seconds: null });
    expect(classifyAdminFailure({ status: 500, body: { error: { id: "E-099" } } })).toEqual({ id: "E-021", seconds: null });
    expect(classifyAdminFailure({ status: 418 })).toEqual({ id: "E-021", seconds: null });
  });
});

describe("user status (icon + text + colour)", () => {
  it.each([
    [{ role: "officer", verified: true, is_active: true }, "verified", true],
    [{ role: "officer", verified: false, is_active: true }, "unverified", true],
    [{ role: "officer", verified: true, is_active: false }, "inactive", true],
    [{ role: "staff", verified: false, is_active: true }, "not-officer", false],
    [{ role: "admin", verified: false, is_active: true }, "not-officer", false],
  ] as const)("%o → %s (toggle %s)", (user, status, toggle) => {
    expect(userStatus(user)).toBe(status);
    expect(canToggleVerification(user)).toBe(toggle);
  });
});

describe("API calls", () => {
  it("API-016 always sends all_eligible with the contract word, as JSON POST", async () => {
    const f = recordingFetch(200, ok);
    expect(await requestRedaction(f.fetchImpl)).toEqual({ kind: "ok", data: ok });
    expect(f.calls[0].url).toBe("/api/admin/anonymise");
    expect(f.calls[0].init?.method).toBe("POST");
    expect(JSON.parse(String(f.calls[0].init?.body))).toEqual({ all_eligible: true, confirmation: "বেনামী" });
    expect(f.calls[0].init?.credentials).toBe("same-origin");
    expect(f.calls[0].init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("refuses a success body that is not the strict contract shape", async () => {
    const f = recordingFetch(200, { ...ok, child_name: "x" });
    expect(await requestRedaction(f.fetchImpl)).toEqual({ kind: "failed", failure: { id: "E-021", seconds: null } });
  });

  it("network failure and non-JSON errors become E-021 / the status mapping", async () => {
    const down: FetchLike = async () => {
      throw new TypeError("network");
    };
    expect(await requestRedaction(down)).toEqual({ kind: "failed", failure: { id: "E-021", seconds: null } });
    expect(await requestRedaction(recordingFetch(403, "<html>").fetchImpl)).toEqual({ kind: "failed", failure: { id: "E-003", seconds: null } });
  });

  it("API-017 posts { verified } to the encoded user path", async () => {
    const f = recordingFetch(200, { id: OFFICER, role: "officer", verified: false });
    expect(await requestVerification(OFFICER, false, f.fetchImpl)).toEqual({ kind: "ok", data: { id: OFFICER, role: "officer", verified: false } });
    expect(f.calls[0].url).toBe(`/api/admin/users/${OFFICER}/verify`);
    expect(JSON.parse(String(f.calls[0].init?.body))).toEqual({ verified: false });
  });

  it("API-021 sends the cursor in the query and parses the strict page", async () => {
    const page = {
      users: [{ id: OFFICER, username: "officer.demo", display_name: "[MOCK] কর্মকর্তা", role: "officer", verified: true, is_active: true }],
      next_cursor: null,
    };
    const f = recordingFetch(200, page);
    expect(await requestUsersPage("abc.def", f.fetchImpl)).toEqual({ kind: "ok", data: page });
    expect(f.calls[0].url).toBe("/api/admin/users?cursor=abc.def");
    expect(f.calls[0].init?.method).toBe("GET");
    const leaky = recordingFetch(200, { ...page, users: [{ ...page.users[0], password_hash: "x" }] });
    expect((await requestUsersPage("abc.def", leaky.fetchImpl)).kind).toBe("failed");
  });

  it("the admin user view can never carry a hash, session or case field (strict contract)", () => {
    const base = { id: OFFICER, username: "officer.demo", display_name: "[MOCK] কর্মকর্তা", role: "officer", verified: true, is_active: true };
    for (const extra of ["password_hash", "session_id", "child_name", "contact_phone", "district_code"]) {
      expect(adminUserViewSchema.safeParse({ ...base, [extra]: "x" }).success, extra).toBe(false);
    }
  });
});
