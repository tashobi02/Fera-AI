import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CLOCK_SKEW_MS,
  allowedCloseOutcome,
  caseDraftSchema,
  countWords,
  createFoundRequestSchema,
  createMissingRequestSchema,
  cursorSchema,
  dashboardStatsResponseSchema,
  decisionResponseSchema,
  evidenceSpanSchema,
  extractRequestSchema,
  extractResponseSchema,
  foundDescriptionLength,
  importRequestSchema,
  inputDateTimeSchema,
  isoDateTimeSchema,
  kindStatus,
  officerCaseViewSchema,
  outputResponseSchema,
  pageLimitSchema,
  reasonSchema,
  reviewQueueQuerySchema,
  statusGroup,
  uuidSchema,
} from "@/contracts";
import {
  exampleConfirmDecisionResponse,
  exampleCreateFoundRequest,
  exampleCreateMissingRequest,
  exampleDashboardStatsResponse,
  exampleExtractFollowUpRequest,
  exampleExtractRequest,
  exampleExtractResponse,
  exampleFoundDraft,
  exampleImportRequest,
  exampleMissingDraft,
  exampleOfficerMissingView,
  exampleOutputResponse,
} from "@/contracts/examples";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-13T10:00:00+06:00"));
});
afterEach(() => vi.useRealTimers());

const ok = (r: { success: boolean }) => r.success;
const missing = (patch: (d: typeof exampleMissingDraft) => unknown) =>
  createMissingRequestSchema.safeParse({ ...exampleCreateMissingRequest, draft: patch(structuredClone(exampleMissingDraft)) });

describe("C8 text: blank is unknown, caps before and after trim", () => {
  it("blank optional text becomes null in drafts and submissions", () => {
    const parsed = missing((d) => ({ ...d, child: { ...d.child, marks: "   ", name_latin: "" }, event: { ...d.event, thana: "\n\t" } }));
    expect(parsed.data?.draft.child).toMatchObject({ marks: null, name_latin: null });
    expect(parsed.data?.draft.event.thana).toBeNull();
    expect(caseDraftSchema.parse({ ...exampleMissingDraft, reporter: { relation: " ", phone: "" } }).reporter).toEqual({ relation: null, phone: null });
  });

  it("trims kept text and enforces the post-trim maximum", () => {
    expect(missing((d) => ({ ...d, child: { ...d.child, marks: "  দাগ  " } })).data?.draft.child.marks).toBe("দাগ");
    expect(ok(missing((d) => ({ ...d, child: { ...d.child, marks: "ক".repeat(301) } })))).toBe(false);
    expect(ok(missing((d) => ({ ...d, child: { ...d.child, marks: ` ${"ক".repeat(300)} ` } })))).toBe(true);
  });

  it("rejects a huge padded value before trimming", () => {
    expect(ok(reasonSchema.safeParse(`${" ".repeat(1001)}কারণ`))).toBe(false);
    expect(ok(reasonSchema.safeParse(`  কারণ  `))).toBe(true);
  });

  it("caps evidence quotes", () => {
    expect(ok(evidenceSpanSchema.safeParse({ quote: "ক".repeat(501), start_utf16: 0, end_utf16: 501, derivation: "direct" }))).toBe(false);
  });
});

describe("C9 district_text is never submitted", () => {
  it("is forced to null on submission drafts", () => {
    expect(missing((d) => ({ ...d, event: { ...d.event, district_text: "ঢাকা" } })).data?.draft.event.district_text).toBeNull();
  });
});

describe("C10 UUIDs", () => {
  it("accept Postgres-valid fixed IDs and normalise to lowercase", () => {
    expect(uuidSchema.parse("00000000-0000-0000-0000-000000000001")).toBe("00000000-0000-0000-0000-000000000001");
    expect(uuidSchema.parse("11111111-1111-1111-1111-111111111111")).toBe("11111111-1111-1111-1111-111111111111");
    expect(uuidSchema.parse("6B1F3C2A-4D5E-4F60-8A71-0000000000A1")).toBe("6b1f3c2a-4d5e-4f60-8a71-0000000000a1");
    for (const bad of ["", "6b1f3c2a4d5e4f608a710000000000a1", "zzzzzzzz-0000-0000-0000-000000000001"]) expect(ok(uuidSchema.safeParse(bad))).toBe(false);
  });
});

describe("C11 time policy", () => {
  it("client times: any offset, canonicalised to +06:00, at most milliseconds", () => {
    expect(inputDateTimeSchema.parse("2026-10-12T10:00:00Z")).toBe("2026-10-12T16:00:00+06:00");
    expect(inputDateTimeSchema.parse("2026-10-12T12:30:00.250+02:30")).toBe("2026-10-12T16:00:00.250+06:00");
    expect(inputDateTimeSchema.parse("2026-10-12T23:30:00+06:00")).toBe("2026-10-12T23:30:00+06:00");
    expect(ok(inputDateTimeSchema.safeParse("2026-10-12T10:00:00.1234Z"))).toBe(false);
    expect(ok(inputDateTimeSchema.safeParse("2026-10-12T10:00:00"))).toBe(false);
  });

  it("server times must already be +06:00, microseconds allowed", () => {
    expect(ok(isoDateTimeSchema.safeParse("2026-10-12T16:00:00.123456+06:00"))).toBe(true);
    expect(ok(isoDateTimeSchema.safeParse("2026-10-12T10:00:00Z"))).toBe(false);
  });

  it("future checks allow CLOCK_SKEW_MS", () => {
    const at = (ms: number) => new Date(Date.now() + ms).toISOString();
    const exact = (iso: string) => missing((d) => ({ ...d, event: { ...d.event, at: iso, at_lower: iso, at_upper: iso, at_approx: false } }));
    expect(ok(exact(at(CLOCK_SKEW_MS - 1000)))).toBe(true);
    expect(ok(exact(at(CLOCK_SKEW_MS + 1000)))).toBe(false);
  });
});

describe("C12 found description matches SQL length(trim(concat_ws(...)))", () => {
  it("counts code points, skips nulls, trims spaces only", () => {
    expect(foundDescriptionLength(["🧒🧒", null, null])).toBe(2);
    expect(foundDescriptionLength(["ক", null, "খ"])).toBe(3); // "ক খ"
    expect(foundDescriptionLength([null, null, null])).toBe(0);
  });

  it("two emoji are not a description, even though they are four UTF-16 units", () => {
    const draft = { ...exampleFoundDraft, child: { ...exampleFoundDraft.child, clothing: "🧒🧒", marks: null }, event: { ...exampleFoundDraft.event, circumstances: null }, evidence: {} };
    expect("🧒🧒".length).toBe(4);
    expect(ok(createFoundRequestSchema.safeParse({ ...exampleCreateFoundRequest, draft }))).toBe(false);
    const three = { ...draft, child: { ...draft.child, clothing: "🧒🧒🧒" } };
    expect(ok(createFoundRequestSchema.safeParse({ ...exampleCreateFoundRequest, draft: three }))).toBe(true);
  });
});

describe("C13 extract request combinations", () => {
  it("valid shapes parse", () => {
    expect(ok(extractRequestSchema.safeParse(exampleExtractRequest))).toBe(true);
    expect(ok(extractRequestSchema.safeParse(exampleExtractFollowUpRequest))).toBe(true);
  });

  it("text cannot carry a draft or revision; a revision needs a token; kinds must agree", () => {
    const { draft, draft_revision } = exampleExtractFollowUpRequest;
    expect(ok(extractRequestSchema.safeParse({ ...exampleExtractRequest, draft }))).toBe(false);
    expect(ok(extractRequestSchema.safeParse({ ...exampleExtractRequest, draft_revision }))).toBe(false);
    expect(ok(extractRequestSchema.safeParse({ kind: "missing", text: exampleExtractRequest.text, draft_revision: 2 }))).toBe(false);
    expect(ok(extractRequestSchema.safeParse({ ...exampleExtractFollowUpRequest, kind: "found" }))).toBe(false);
  });

  it("missing_fields and next_question.field are draft field paths", () => {
    expect(ok(extractResponseSchema.safeParse({ ...exampleExtractResponse, missing_fields: ["child.favourite"] }))).toBe(false);
    const q = { ...exampleExtractResponse.next_question!, field: "anything" };
    expect(ok(extractResponseSchema.safeParse({ ...exampleExtractResponse, next_question: q }))).toBe(false);
  });
});

describe("C14 output word count comes from the text", () => {
  const helpline = (words: number) => {
    const text = `খসড়া ${Array.from({ length: words - 1 }, () => "শব্দ").join(" ")}`;
    return { ...exampleOutputResponse, type: "helpline" as const, text_bn: text, word_count: countWords(text) };
  };
  it("helpline ≤80 counted words; self-reported count must match", () => {
    expect(ok(outputResponseSchema.safeParse(helpline(80)))).toBe(true);
    expect(ok(outputResponseSchema.safeParse(helpline(81)))).toBe(false);
    expect(ok(outputResponseSchema.safeParse({ ...helpline(81), word_count: 80 }))).toBe(false);
    expect(ok(outputResponseSchema.safeParse({ ...exampleOutputResponse, word_count: 1 }))).toBe(false);
  });
});

describe("C16 synthetic source URLs", () => {
  const url = (source_url: string) =>
    importRequestSchema.safeParse({ ...exampleImportRequest, items: [{ ...exampleImportRequest.items[0], source_url }] });
  it("https example.invalid hosts only, no credentials, capped", () => {
    expect(ok(url("https://example.invalid/a"))).toBe(true);
    expect(ok(url("https://fixture.example.invalid/a"))).toBe(true);
    for (const bad of [
      "http://example.invalid/a",
      "https://evil-example.invalid/a",
      "https://example.invalid.evil.com/a",
      "https://user:pw@example.invalid/a",
      "javascript:alert(1)",
      `https://example.invalid/${"a".repeat(500)}`,
    ]) {
      expect(ok(url(bad))).toBe(false);
    }
    expect(ok(officerCaseViewSchema.safeParse({ ...exampleOfficerMissingView, source_url: "https://real-news.example.com/x" }))).toBe(false);
  });
});

describe("C17 cursors and query integers", () => {
  it("cursor is an opaque safe-charset token", () => {
    expect(ok(cursorSchema.safeParse("eyJpZCI6MX0.c2lnbmF0dXJlLXZhbHVlLTE2"))).toBe(true);
    for (const bad of ["", "abc", "a b c d e f g h", "../../etc/passwd", "eyJpZCI6MX0';--"]) expect(ok(cursorSchema.safeParse(bad))).toBe(false);
  });

  it("query integers are plain decimal strings", () => {
    expect(pageLimitSchema.parse("20")).toBe(20);
    for (const bad of ["0x1A", "1e1", " 5 ", "5.0", "-1", "", "51", "0", "05"]) expect(ok(pageLimitSchema.safeParse(bad))).toBe(false);
    expect(ok(reviewQueueQuerySchema.safeParse({ district: "26" }))).toBe(true);
    expect(ok(reviewQueueQuerySchema.safeParse({ district: "65" }))).toBe(false);
    expect(ok(reviewQueueQuerySchema.safeParse({ district: 26 }))).toBe(false);
  });
});

describe("D19 status helpers", () => {
  it("statusGroup takes a narrowed pair; kindStatus throws on forbidden pairs", () => {
    expect(statusGroup(kindStatus("found", "referred"))).toBe("closed");
    expect(statusGroup(kindStatus("missing", "confirmed"))).toBe("matched");
    expect(() => kindStatus("found", "closed")).toThrow();
    expect(() => kindStatus("missing", "referred")).toThrow();
  });
});

describe("D20 closure outcomes", () => {
  it("confirmed → coordination_recorded, open → resolved_outside_fera, otherwise none", () => {
    expect(allowedCloseOutcome("confirmed")).toBe("coordination_recorded");
    expect(allowedCloseOutcome("open")).toBe("resolved_outside_fera");
    for (const s of ["submitted", "matched_pending_review", "closed"] as const) expect(allowedCloseOutcome(s)).toBeNull();
  });
});

describe("D22 decision response endpoint state and version", () => {
  it("requires versions and kind-correct statuses", () => {
    const r = exampleConfirmDecisionResponse;
    expect(ok(decisionResponseSchema.safeParse({ ...r, missing: { ref_code: r.missing.ref_code, status: "confirmed" } }))).toBe(false);
    expect(ok(decisionResponseSchema.safeParse({ ...r, missing: { ...r.missing, status: "referred" } }))).toBe(false);
    expect(ok(decisionResponseSchema.safeParse({ ...r, candidate_status: "rejected", referral_id: null, referral_state: null }))).toBe(false);
  });
});

describe("D23 dashboard invariants", () => {
  const d = exampleDashboardStatsResponse;
  it("confirmed pairs equal referral-recorded found reports", () => {
    const districts = d.districts.map((x) => (x.code === 26 ? { ...x, confirmed_pairs: 2 } : x));
    expect(ok(dashboardStatsResponseSchema.safeParse({ ...d, districts, totals: { ...d.totals, confirmed_pairs: 2 } }))).toBe(false);
  });

  it("district coordinates stay inside the SQL bounds; codes are unique", () => {
    const shifted = d.districts.map((x) => (x.code === 1 ? { ...x, lat: 19.9 } : x));
    expect(ok(dashboardStatsResponseSchema.safeParse({ ...d, districts: shifted }))).toBe(false);
    const dup = d.districts.map((x) => (x.code === 2 ? { ...x, code: 1 } : x));
    expect(ok(dashboardStatsResponseSchema.safeParse({ ...d, districts: dup }))).toBe(false);
  });
});
