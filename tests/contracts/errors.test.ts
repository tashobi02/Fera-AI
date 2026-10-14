import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CLIENT_ONLY_ERROR_IDS,
  ERROR_CATALOGUE,
  ERROR_IDS,
  errorEnvelope,
  errorEnvelopeSchema,
  httpStatusFor,
  type ErrorId,
} from "@/contracts";

const spec = (file: string) => readFileSync(join(import.meta.dirname, "..", "..", "docs", "spec", file), "utf8");
const rows = (md: string) =>
  md
    .split("\n")
    .filter((l) => /^\| E-0\d\d \|/.test(l))
    .map((l) => l.split("|").map((c) => c.trim()));

const partA = new Map(rows(spec("D2_TRD_PartA_V2.md")).map((c) => [c[1], { key: c[2], http: c[3] }]));
const partB = new Map(rows(spec("D2_TRD_PartB_V2.md")).map((c) => [c[1], { key: c[2], message: c[3] }]));

describe("error envelope E-001–E-024", () => {
  it("has all 24 codes in order", () => {
    expect(ERROR_IDS).toEqual(Array.from({ length: 24 }, (_, i) => `E-${String(i + 1).padStart(3, "0")}`));
  });

  it.each(ERROR_IDS.map((id) => [id] as const))("%s matches the D2A key/HTTP and D2B bilingual message", (id) => {
    const entry = ERROR_CATALOGUE[id];
    const b = partB.get(id)!;
    expect(entry.key).toBe(b.key);
    expect(entry.bn.trim()).not.toBe("");
    expect(entry.en.trim()).not.toBe("");
    if ("placeholder" in entry) {
      expect(id).toBe("E-020"); // D2B has no user message for the reserved code
      expect(b.message).not.toContain(" / ");
    } else {
      expect(`${entry.bn} / ${entry.en}`).toBe(b.message);
    }
    const a = partA.get(id);
    if (CLIENT_ONLY_ERROR_IDS.includes(id as never)) {
      expect(entry.http).toBeNull();
      expect(a === undefined || a.http === "—").toBe(true);
    } else {
      expect(a?.key.startsWith(entry.key)).toBe(true);
      expect(String(entry.http)).toBe(a?.http);
    }
  });

  it("E-022 and E-024 are client-only with no HTTP status", () => {
    expect([...CLIENT_ONLY_ERROR_IDS]).toEqual(["E-022", "E-024"]);
    expect(ERROR_IDS.filter((id) => ERROR_CATALOGUE[id].http === null)).toEqual(["E-022", "E-024"]);
    expect(httpStatusFor("E-004")).toBe(404);
  });

  it.each(ERROR_IDS.map((id) => [id] as const))("%s builds a valid envelope", (id: ErrorId) => {
    expect(errorEnvelopeSchema.safeParse(errorEnvelope(id)).success).toBe(true);
  });

  it("fills E-007 seconds, with Bangla numerals in Bangla", () => {
    const { error } = errorEnvelope("E-007", { seconds: 30 });
    expect(error.message_bn).toBe("৩০ সেকেন্ড পরে আবার চেষ্টা করুন।");
    expect(error.message_en).toBe("Please try again in 30 seconds.");
    expect(error.retryable).toBe(true);
  });

  it("AI failures fall back to the manual form", () => {
    for (const id of ["E-012", "E-013", "E-014", "E-023"] as const) expect(errorEnvelope(id).error.fallback).toBe("manual_form");
    expect(errorEnvelope("E-004").error).not.toHaveProperty("fallback");
  });

  it("E-004 is one envelope for absent and hidden records", () => {
    expect(errorEnvelope("E-004")).toEqual(errorEnvelope("E-004"));
    expect(Object.keys(errorEnvelope("E-004").error).sort()).toEqual(["id", "key", "message_bn", "message_en", "retryable"]);
  });

  it("rejects mismatched keys and unknown codes", () => {
    const env = errorEnvelope("E-001");
    expect(errorEnvelopeSchema.safeParse({ error: { ...env.error, key: "NOT_FOUND" } }).success).toBe(false);
    expect(errorEnvelopeSchema.safeParse({ error: { ...env.error, id: "E-025" } }).success).toBe(false);
    expect(errorEnvelopeSchema.safeParse({ error: { ...env.error, stack: "trace" } }).success).toBe(false);
  });
});
