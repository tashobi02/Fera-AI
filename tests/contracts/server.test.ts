import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMissingRequestSchema, sessionViewSchema, adminUserViewSchema, type MissingSubmissionDraftInput } from "@/contracts";
import {
  canonicalJson,
  classifySubmission,
  intakeDraftMetadataSchema,
  parseSignInRequest,
  submissionPayloadHash,
  submissionScopeFor,
  type SubmissionKey,
} from "@/contracts/server";
import { IDS, PRINCIPALS, exampleCreateMissingRequest, exampleIntakeDraftMetadata, exampleMissingDraft, exampleSessionView } from "@/contracts/examples";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-13T10:00:00+06:00"));
});
afterEach(() => vi.useRealTimers());

const parseDraft = (patch: (d: typeof exampleMissingDraft) => unknown = (d) => d) =>
  createMissingRequestSchema.parse({ ...exampleCreateMissingRequest, draft: patch(structuredClone(exampleMissingDraft)) }).draft;

const H = (c: string) => c.repeat(64);

describe("canonical JSON and payload hash (D2A §5.6, TC-042)", () => {
  it("known-answer vector", () => {
    const value = { c: { z: "x", y: 2 }, b: 1, a: [true, null, "ক"], skipped: undefined };
    const json = canonicalJson(value);
    expect(json).toBe('{"a":[true,null,"ক"],"b":1,"c":{"y":2,"z":"x"}}');
    expect(createHash("sha256").update(json, "utf8").digest("hex")).toBe("977b5e5f8398a2d336ca5a35cdaeaeaffdce3da637fbb5bcecfc227a0142dafb");
  });

  it("accepts parsed submission drafts only (type-level)", () => {
    const input: MissingSubmissionDraftInput = exampleMissingDraft;
    // Compile-time only: an unparsed client draft is not hashable.
    const hashUnparsed = () =>
      // @ts-expect-error MissingSubmissionDraftInput is not a parsed MissingSubmissionDraft
      submissionPayloadHash(input);
    expect(typeof hashUnparsed).toBe("function");
  });

  it("throws on values JSON cannot represent exactly", () => {
    for (const bad of [{ n: NaN }, { n: Infinity }, [undefined], { d: new Date(0) }, { b: BigInt(1) }, { f: () => 1 }]) {
      expect(() => canonicalJson(bad)).toThrow();
    }
  });

  it("pins the example draft hash (regression lock for the canonical form)", () => {
    expect(submissionPayloadHash(parseDraft())).toMatch(/^[0-9a-f]{64}$/);
    expect(submissionPayloadHash(parseDraft())).toBe(EXAMPLE_DRAFT_HASH);
  });

  it("Bangla and ASCII phone digits hash equally", () => {
    const bangla = parseDraft((d) => ({ ...d, reporter: { ...d.reporter, phone: "০১৭০০-০০০০০১" } }));
    expect(submissionPayloadHash(bangla)).toBe(submissionPayloadHash(parseDraft()));
  });

  it("exact age with or without the filled range hashes equally", () => {
    const short = parseDraft((d) => ({ ...d, child: { ...d.child, age_min: null, age_max: null } }));
    expect(submissionPayloadHash(short)).toBe(submissionPayloadHash(parseDraft()));
  });

  it("offset, blank text and district_text do not change the hash; a real edit does", () => {
    const utc = parseDraft((d) => ({ ...d, event: { ...d.event, at: "2026-10-12T10:00:00Z", district_text: "জেলা ২৬", thana: "  " } }));
    expect(submissionPayloadHash(utc)).toBe(submissionPayloadHash(parseDraft()));
    const edited = parseDraft((d) => ({ ...d, child: { ...d.child, marks: "দাগ" } }));
    expect(submissionPayloadHash(edited)).not.toBe(submissionPayloadHash(parseDraft()));
  });
});

describe("submission scope and classification (FR-031)", () => {
  it("scope comes from the principal", () => {
    expect(submissionScopeFor(PRINCIPALS.parent)).toEqual({ principal: "parent_session", sessionId: IDS.parentSession });
    expect(submissionScopeFor(PRINCIPALS.staff)).toEqual({ principal: "user", userId: IDS.staffUser });
    expect(submissionScopeFor(PRINCIPALS.officer)).toEqual({ principal: "user", userId: IDS.officerUser });
    expect(submissionScopeFor(PRINCIPALS.admin)).toBeNull();
    expect(submissionScopeFor({ ...PRINCIPALS.staff, isActive: false })).toBeNull();
    expect(submissionScopeFor(null)).toBeNull();
  });

  const key: SubmissionKey = { scope: { principal: "parent_session", sessionId: IDS.parentSession }, clientSubmissionId: IDS.missingSubmission };
  const existing = { ...key, caseId: IDS.missingCase, payloadHash: H("a") };

  it("TC-042: same UUID + same hash replays, changed payload conflicts, new UUID creates", () => {
    expect(classifySubmission(key, existing, H("a"))).toEqual({ kind: "replay", caseId: IDS.missingCase });
    expect(classifySubmission(key, existing, H("b"))).toEqual({ kind: "conflict" });
    expect(classifySubmission(key, null, H("a"))).toEqual({ kind: "create" });
  });

  it("validates both hashes and the key of the existing row", () => {
    expect(() => classifySubmission(key, null, "abc")).toThrow();
    expect(() => classifySubmission(key, { ...existing, payloadHash: "A".repeat(64) }, H("a"))).toThrow();
    expect(() => classifySubmission(key, { ...existing, scope: { principal: "parent_session", sessionId: IDS.otherParentSession } }, H("a"))).toThrow();
    expect(() => classifySubmission(key, { ...existing, scope: { principal: "user", userId: IDS.staffUser } }, H("a"))).toThrow();
    expect(() => classifySubmission(key, { ...existing, clientSubmissionId: IDS.foundSubmission }, H("a"))).toThrow();
    // UUID case does not matter.
    expect(classifySubmission({ ...key, clientSubmissionId: IDS.missingSubmission.toUpperCase() }, existing, H("a")).kind).toBe("replay");
  });
});

describe("server-only intake metadata (D21, TC-060)", () => {
  it("exactly one of session_id or user_id, and expires after creation", () => {
    expect(intakeDraftMetadataSchema.safeParse(exampleIntakeDraftMetadata).success).toBe(true);
    expect(intakeDraftMetadataSchema.safeParse({ ...exampleIntakeDraftMetadata, user_id: IDS.staffUser }).success).toBe(false);
    expect(intakeDraftMetadataSchema.safeParse({ ...exampleIntakeDraftMetadata, session_id: null }).success).toBe(false);
    expect(intakeDraftMetadataSchema.safeParse({ ...exampleIntakeDraftMetadata, expires_at: exampleIntakeDraftMetadata.created_at }).success).toBe(false);
  });
});

describe("API-020 sign-in (C18)", () => {
  it("trims and lowercases the username", () => {
    expect(parseSignInRequest({ username: "  Officer.Demo ", password: "x" })).toEqual({ ok: true, data: { username: "officer.demo", password: "x" } });
  });

  it("every malformed body is the generic E-002", () => {
    for (const body of [{}, { username: "ab", password: "x" }, { username: "officer demo", password: "x" }, { username: "officer.demo", password: "" }, null]) {
      expect(parseSignInRequest(body)).toEqual({ ok: false, errorId: "E-002" });
    }
  });

  it("only officers can be verified; display names cannot carry numbers", () => {
    expect(sessionViewSchema.safeParse({ ...exampleSessionView, role: "staff", verified: true }).success).toBe(false);
    expect(sessionViewSchema.safeParse({ ...exampleSessionView, display_name: "Officer 01700000001" }).success).toBe(false);
    const user = { id: IDS.adminUser, username: "admin.demo", display_name: "[MOCK] অ্যাডমিন", role: "admin", verified: true, is_active: true };
    expect(adminUserViewSchema.safeParse(user).success).toBe(false);
    expect(adminUserViewSchema.safeParse({ ...user, verified: false }).success).toBe(true);
  });
});

// Pinned from the current canonical form; a change here means every stored
// submission_payload_hash would stop matching its replay.
const EXAMPLE_DRAFT_HASH = "2e3c5354ca3e8368aa55e0d4196167b4c29fff737eb3cede1dcd6e88ac602f10";
