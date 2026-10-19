import { describe, expect, it } from "vitest";
import { queueCandidateSchema } from "@/contracts";
import { exampleReviewQueueResponse } from "@/contracts/examples";

const candidate = exampleReviewQueueResponse.items[0]!.candidates[0]!;

describe("match component contract", () => {
  it("rejects keys that the matcher cannot project", () => {
    expect(queueCandidateSchema.safeParse({ ...candidate, components: { cos: 0.7 } }).success).toBe(false);
    expect(queueCandidateSchema.safeParse({ ...candidate, components: { cosine: 0.7 } }).success).toBe(true);
  });
});
