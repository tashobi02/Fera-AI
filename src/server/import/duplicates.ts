// Duplicate signal for the synthetic import (TASK-048; TC-014).
// Repeated submissions are skipped by the case service. They do not create
// duplicate_links, so they cannot count as persisted duplicate flags.
// Source URLs are never fetched.
export function computeDuplicatesFlagged(
  items: readonly { kind: "imported" | "skipped"; reason?: string }[],
): number {
  void items;
  return 0;
}
