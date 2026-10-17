// Duplicate signal for the synthetic import (TASK-048; TC-014).
// API-015 reports repeated text within the submitted batch as a count only.
// It does not claim to check older rows; source URLs are never fetched.
import { createHash } from "node:crypto";

type RequestItem = { text: string };

function textHash(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex").slice(0, 16);
}

// Counts extra occurrences of the same text hash in the batch. The function
// is pure and deterministic; it exposes neither text nor case identifiers.
export function computeDuplicatesFlagged(
  items: readonly RequestItem[],
): number {
  let count = 0;
  const seen = new Set<string>();
  for (const item of items) {
    const h = textHash(item.text);
    if (seen.has(h)) count++;
    else seen.add(h);
  }
  return count;
}
