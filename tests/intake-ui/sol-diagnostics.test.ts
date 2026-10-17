// TASK-021 Sol privacy regression: record keys in Zod paths are response payload.
import { expect, it, vi } from "vitest";
import { clientExamples } from "@/contracts/client-examples";
import { createHttpIntakeClient } from "@/lib/intake/client";

it("schema diagnostics log the error name, never a rejected evidence key or value", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  try {
    const response = structuredClone(clientExamples.extractResponse);
    response.draft.evidence = { "SYNTHETIC CHILD PAYLOAD 01700000001": { quote: "payload", start_utf16: 0, end_utf16: 7, derivation: "direct" } } as typeof response.draft.evidence;
    const result = await createHttpIntakeClient(async () => Response.json(response)).extract(clientExamples.extractRequest, new AbortController().signal);
    expect(result).toMatchObject({ ok: false, error: { error: { id: "E-021" } } });
    expect(warn.mock.calls).toEqual([["intake response: ZodError"]]);
  } finally {
    warn.mockRestore();
  }
});
