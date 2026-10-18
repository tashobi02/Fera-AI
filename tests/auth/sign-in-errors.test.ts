// TASK-031: SCREEN-008 error copy (D3 SCREEN-008: generic E-002; E-007 with the wait in
// seconds, Bangla numerals in Bangla mode; any other failure a safe generic message).
import { describe, expect, it } from "vitest";
import { errorEnvelope } from "@/contracts";
import { ApiError, errorResponse } from "@/app/api/_shared/envelope";
import { classifySignInFailure, retryAfterSeconds, signInFailureText } from "@/lib/sign-in-errors";

const e002 = errorEnvelope("E-002");

describe("E-002: one generic message", () => {
  it("uses the exact D3 SCREEN-008 copy in both languages", () => {
    const failure = classifySignInFailure({ status: 401, body: e002 });
    expect(failure).toEqual({ kind: "credentials" });
    expect(signInFailureText(failure, "bn")).toBe("ইউজারনেম বা পাসওয়ার্ড ঠিক নয়");
    expect(signInFailureText(failure, "en")).toBe("Username or password is incorrect");
  });

  it("never names one field: any 401 reads the same, whatever the body says", () => {
    const texts = new Set(
      [e002, null, "not json", { error: { id: "E-002", message_en: "unknown user" } }, { error: { id: "E-001" } }].map((body) =>
        signInFailureText(classifySignInFailure({ status: 401, body }), "en"),
      ),
    );
    expect([...texts]).toEqual(["Username or password is incorrect"]);
    const bn = signInFailureText({ kind: "credentials" }, "bn");
    expect(bn).toContain("ইউজারনেম");
    expect(bn).toContain("পাসওয়ার্ড");
  });
});

describe("E-007: rate limited", () => {
  it("shows the Retry-After seconds, in Bangla numerals in Bangla mode", () => {
    const failure = classifySignInFailure({ status: 429, body: errorEnvelope("E-007", { seconds: 42 }), retryAfter: "42" });
    expect(failure).toEqual({ kind: "rate-limited", seconds: 42 });
    const bn = signInFailureText(failure, "bn");
    expect(bn).toBe("৪২ সেকেন্ড পরে আবার চেষ্টা করুন।");
    expect(bn).not.toMatch(/[0-9]/);
    expect(signInFailureText(failure, "en")).toBe("Please try again in 42 seconds.");
  });

  it("matches the server's own E-007 envelope and header end to end", async () => {
    const { response } = errorResponse("req-1", new ApiError("E-007", { seconds: 57, reason: "ratelimit" }));
    const body = await response.json();
    const failure = classifySignInFailure({ status: response.status, body, retryAfter: response.headers.get("retry-after") });
    expect(signInFailureText(failure, "bn")).toBe(body.error.message_bn);
    expect(signInFailureText(failure, "en")).toBe(body.error.message_en);
  });

  it("falls back to a wait-a-little message without a usable Retry-After", () => {
    for (const header of [null, "", "0", "-5", "1.5", "Wed, 21 Oct 2026 07:28:00 GMT", "99999999"]) {
      const failure = classifySignInFailure({ status: 429, retryAfter: header });
      expect(failure).toEqual({ kind: "rate-limited", seconds: null });
      expect(signInFailureText(failure, "bn")).toBe("একটু পরে আবার চেষ্টা করুন।");
      expect(signInFailureText(failure, "en")).toBe("Please try again in a little while.");
    }
  });

  it("parses delay-seconds strictly", () => {
    expect(retryAfterSeconds(" 60 ")).toBe(60);
    expect(retryAfterSeconds("3600")).toBe(3600);
    expect(retryAfterSeconds("3601")).toBeNull();
    expect(retryAfterSeconds("6e1")).toBeNull();
  });
});

describe("anything else: a safe generic message", () => {
  it.each([
    [403, errorEnvelope("E-003")],
    [500, errorEnvelope("E-021")],
    [500, null],
    [502, "<html>bad gateway</html>"],
    [200, { error: { id: "E-999" } }],
  ])("status %i", (status, body) => {
    const failure = classifySignInFailure({ status, body });
    expect(failure).toEqual({ kind: "generic" });
    expect(signInFailureText(failure, "bn")).toBe("কিছু একটা ভুল হয়েছে। আবার চেষ্টা করুন।");
    expect(signInFailureText(failure, "en")).toBe("Something went wrong. Please try again.");
  });

  it("never shows text from the response", () => {
    const failure = classifySignInFailure({ status: 418, body: { error: { id: "E-021", message_en: "<script>x</script>" } } });
    expect(signInFailureText(failure, "en")).not.toContain("script");
  });
});
