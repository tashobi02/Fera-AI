// API-015 import boundary (TASK-048, FR-024, TC-014).
import { describe, expect, it, vi } from "vitest";
import { errorEnvelopeSchema, importResponseSchema, LIMITS, type ImportResponse } from "@/contracts";
import { PRINCIPALS, exampleImportRequest } from "@/contracts/examples";
import type { ImportService } from "@/app/api/admin/import/route";
import { importRoute } from "@/app/api/admin/import/route";
import { computeDuplicatesFlagged } from "@/server/import/duplicates";
import { jsonPost, noParams, testFactory } from "./fakes";

const counts: ImportResponse = { imported: 1, skipped: 0, duplicates_flagged: 0 };

describe("API-015 synthetic import", () => {
  it("allows admins and returns strict counts only", async () => {
    const { defineRoute } = testFactory(PRINCIPALS.admin);
    const service = vi.fn<ImportService>(async () => counts);
    const post = importRoute(defineRoute, service);
    const response = await post(jsonPost("/api/admin/import", exampleImportRequest), noParams);

    expect(response.status).toBe(200);
    expect(importResponseSchema.parse(await response.json())).toEqual(counts);
    expect(service).toHaveBeenCalledOnce();
    const [, passedInput] = service.mock.calls[0];
    expect(passedInput.items[0]).toMatchObject({
      synthetic: true,
      source_url: "https://fixture.example.invalid/post/1",
    });
  });

  it("denies non-admins before invoking the import service", async () => {
    const { defineRoute } = testFactory(PRINCIPALS.staff);
    const service = vi.fn<ImportService>(async () => counts);
    const response = await importRoute(defineRoute, service)(
      jsonPost("/api/admin/import", exampleImportRequest),
      noParams,
    );

    expect(response.status).toBe(403);
    expect(errorEnvelopeSchema.parse(await response.json()).error.id).toBe("E-003");
    expect(service).not.toHaveBeenCalled();
  });

  it("rejects non-synthetic annotations and non-example.invalid URLs", async () => {
    const { defineRoute } = testFactory(PRINCIPALS.admin);
    const service = vi.fn<ImportService>(async () => counts);
    const post = importRoute(defineRoute, service);
    const item = exampleImportRequest.items[0];

    for (const changed of [
      { ...item, synthetic: false },
      { ...item, source_url: "https://example.com/source/1" },
    ]) {
      const body = { ...exampleImportRequest, items: [changed] };
      const response = await post(jsonPost("/api/admin/import", body), noParams);
      expect(response.status).toBe(400);
      expect(errorEnvelopeSchema.parse(await response.json()).error.id).toBe("E-001");
    }
    expect(service).not.toHaveBeenCalled();
  });

  it("uses the API-015 body limit for valid batches above the default JSON cap", async () => {
    const { defineRoute } = testFactory(PRINCIPALS.admin);
    const service = vi.fn<ImportService>(async () => ({ imported: 40, skipped: 0, duplicates_flagged: 0 }));
    const post = importRoute(defineRoute, service);
    const body = {
      ...exampleImportRequest,
      items: Array.from({ length: 40 }, (_, i) => ({
        text: `${String(i).padStart(2, "0")}${"x".repeat(1998)}`,
        source_url: `https://fixture.example.invalid/batch/${i + 1}`,
        synthetic: true as const,
      })),
    };
    const bytes = new TextEncoder().encode(JSON.stringify(body)).byteLength;
    expect(bytes).toBeGreaterThan(LIMITS.jsonBodyBytes);
    expect(bytes).toBeLessThan(LIMITS.importBodyBytes);

    const response = await post(jsonPost("/api/admin/import", body), noParams);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ imported: 40, skipped: 0, duplicates_flagged: 0 });
    expect(service).toHaveBeenCalledOnce();
  });

  it("rejects any service response containing case payload fields", async () => {
    const { defineRoute } = testFactory(PRINCIPALS.admin);
    const leakingService = (async () => ({
      ...counts,
      child_name: "[MOCK] payload",
    })) as ImportService;
    const response = await importRoute(defineRoute, leakingService)(
      jsonPost("/api/admin/import", exampleImportRequest),
      noParams,
    );

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(errorEnvelopeSchema.parse(body).error.id).toBe("E-021");
    expect(JSON.stringify(body)).not.toContain("[MOCK] payload");
  });

  it("counts extra copies of text only within the submitted batch", () => {
    expect(computeDuplicatesFlagged([
      { text: "[MOCK] repeated synthetic text" },
      { text: "[MOCK] unique synthetic text" },
      { text: "[MOCK] repeated synthetic text" },
      { text: "[MOCK] repeated synthetic text" },
    ])).toBe(2);
    expect(computeDuplicatesFlagged([{ text: "[MOCK] unique synthetic text" }])).toBe(0);
  });
});
