// TASK-025 / TC-017: SCREEN-005 draft rules (pure). Pre-fill only from a real API-002
// response; a [MOCK] hand-off keeps only the parent's own words; the finished manual
// draft is a valid API-003 request once the parent confirms on S-003.
import { describe, expect, it } from "vitest";
import { caseDraftSchema, createMissingRequestSchema } from "@/contracts";
import { clientExamples } from "@/contracts/client-examples";
import type { IntakeHandoff } from "@/lib/intake/handoff";
import { emptyMissingDraft, manualDraft, manualFromStored } from "@/lib/intake/manual";
import { buildSubmission, editField, validateReview } from "@/lib/intake/review";

const NOW = Date.parse("2026-10-17T10:00:00+06:00");
const WORDS = "আমার মেয়ে মিতু, বয়স ৭ বছর। গতকাল বিকেলে বাস টার্মিনালের কাছে শেষ দেখা গেছে।";
const realDraft = caseDraftSchema.parse({ ...clientExamples.createMissingRequest.draft, event: { ...clientExamples.createMissingRequest.draft.event, district_text: null } });
const handoff = (over: Partial<IntakeHandoff> = {}): IntakeHandoff => ({
  to: "manual", sourceText: WORDS, missing: [], asked: 2, cached: false, mock: false,
  response: { ...clientExamples.extractResponse, draft: realDraft, expires_at: new Date(NOW + 60 * 60_000).toISOString() },
  ...over,
});
const fill = (record: ReturnType<typeof manualDraft>["record"]) =>
  [["child.age_years", "৭"], ["event.at", "2026-10-16T15:00:00+06:00"], ["event.at_lower", "2026-10-16T15:00:00+06:00"], ["event.at_upper", "2026-10-16T15:00:00+06:00"], ["event.place_text", "বাস টার্মিনালের কাছে"], ["event.district_code", "২৬"], ["reporter.phone", "০১৭০০০০০০০১"]]
    .reduce((r, [path, value]) => editField(r, path as never, value!), record);

describe("emptyMissingDraft", () => {
  it("is a valid all-unknown missing draft (unknown stays unknown)", () => {
    const draft = caseDraftSchema.parse(emptyMissingDraft());
    expect(draft.kind).toBe("missing");
    expect(draft.child.sex).toBe("unknown");
    expect(Object.values(draft.child).filter((v) => v !== null && v !== "unknown")).toEqual([]);
    expect(draft.evidence).toEqual({});
  });
});

describe("manualDraft", () => {
  it("starts empty without a hand-off, as the parent's own (non-[MOCK]) draft for 24 h", () => {
    const { record, prefill } = manualDraft(null, NOW);
    expect(prefill).toBe("none");
    expect(record).toMatchObject({ mock: false, cached: false, attempted: false, sourceText: "", edits: {}, savedAt: NOW, expiresAt: NOW + 24 * 3_600_000 });
    expect(record.client_submission_id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("pre-fills a real API-002 response with its parsed fields, token and the shorter expiry (TC-017)", () => {
    const { record, prefill } = manualDraft(handoff(), NOW);
    expect(prefill).toBe("ai");
    expect(record.draft).toEqual(realDraft);
    expect(record.draftToken).toBe(clientExamples.extractResponse.draft_token);
    expect(record.expiresAt).toBe(NOW + 60 * 60_000);
    expect(record.mock).toBe(false);
  });

  it("never carries [MOCK] values: keeps only the parent's own words", () => {
    const { record, prefill } = manualDraft(handoff({ mock: true }), NOW);
    expect(prefill).toBe("own-words");
    expect(record.mock).toBe(false);
    expect(record.draft).toEqual(emptyMissingDraft(WORDS));
    expect(record.draft.child.name).toBeNull(); // the [MOCK] draft had a name; it is not copied
    expect(record.draftToken).toBeUndefined();
    expect(record.sourceText).toBe(WORDS);
    expect(record.edits).toEqual({ "event.circumstances": WORDS }); // TC-017 "text kept"
  });

  it("keeps long words beside the form instead of cutting them into the 500-character field", () => {
    const long = "ক".repeat(600);
    const { record } = manualDraft(handoff({ mock: true, sourceText: long }), NOW);
    expect(record.sourceText).toBe(long);
    expect(record.edits).toEqual({});
  });

  it("an AI failure hand-off with no response keeps the words (E-012/E-013/E-023 path)", () => {
    const { record, prefill } = manualDraft(handoff({ response: null }), NOW);
    expect(prefill).toBe("own-words");
    expect(record.edits["event.circumstances"]).toBe(WORDS);
  });
});

describe("manualFromStored", () => {
  it("restarts a stored [MOCK] draft from the parent's words, and keeps a real one", () => {
    const real = manualDraft(handoff(), NOW).record;
    expect(manualFromStored(real, NOW)).toEqual({ record: real, prefill: "none" });
    const restarted = manualFromStored({ ...real, mock: true }, NOW);
    expect(restarted.record.mock).toBe(false);
    expect(restarted.record.draft.child.name).toBeNull();
    expect(restarted.prefill).toBe("own-words");
  });
});

describe("the finished manual draft", () => {
  it("lists exactly the required fields while empty", () => {
    const missing = validateReview(manualDraft(null, NOW).record);
    for (const path of ["event.place_text", "event.district_code", "reporter.phone"]) expect(missing).toContain(path);
  });

  it("becomes a valid API-003 request once filled and confirmed (submitted on S-003)", () => {
    const record = fill(manualDraft(handoff({ mock: true }), NOW).record);
    expect(validateReview(record)).toEqual([]);
    expect(buildSubmission(record, false)).toBeNull(); // nothing without the parent's confirmation
    const request = buildSubmission(record, true);
    expect(createMissingRequestSchema.safeParse(request).success).toBe(true);
    expect(request?.draft.event.district_code).toBe(26);
    expect(request?.draft.reporter.phone).toBe("01700000001");
    expect(request?.draft.event.circumstances).toBe(WORDS);
    expect(request?.draft_token).toBeUndefined();
  });
});
