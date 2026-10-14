// Row-lock protocol for every transaction that changes case or candidate state
// (TASK-015; BR-020 "locks endpoints in sorted UUID order"; D2A §8 Concurrency).
//
//   1. Lock every case the transaction will change, FOR UPDATE, in ascending UUID order,
//      in one pass, before touching match_candidates. Never lock a lower UUID later.
//   2. Change a match_candidates row only while holding the locks on both of its
//      endpoint cases. Candidate rows are then locked (FOR UPDATE, ascending ID) after
//      the cases.
//   3. The matcher (TASK-017) follows the same rule before inserting candidates: lock
//      both endpoints with lockCases(), insert, then reconcileQueueState() (state.ts).
//      An INSERT's foreign-key check takes KEY SHARE on the endpoints, which conflicts
//      with FOR UPDATE, so an unlocked insert can deadlock with a decision; the deadlock
//      is retried (tx.ts) but should not happen under this protocol.
//
// Postgres orders uuid values bytewise, which equals JS string order on the lowercase
// canonical form (the contracts lowercase every UUID).
import type { PoolClient } from "pg";
import { isUuid } from "@/contracts";
import type { CaseRow } from "@/contracts/server";
import { LockSetChanged } from "./errors";
import { CASE_COLUMNS, mapCaseRow, pendingCandidatesFor, type PendingCandidate } from "./rows";

type Queryable = Pick<PoolClient, "query">;

export function sortedIds(ids: Iterable<string>): string[] {
  return [...new Set([...ids].filter(isUuid).map((id) => id.toLowerCase()))].sort();
}

// Locks the given cases one by one in ascending UUID order. Absent IDs are skipped.
// Re-locking a row this transaction already holds is a no-op.
export async function lockCases(db: Queryable, ids: Iterable<string>): Promise<Map<string, CaseRow>> {
  const locked = new Map<string, CaseRow>();
  for (const id of sortedIds(ids)) {
    const { rows } = await db.query(`SELECT ${CASE_COLUMNS} FROM cases WHERE id = $1 FOR UPDATE`, [id]);
    if (rows[0]) locked.set(id, mapCaseRow(rows[0]));
  }
  return locked;
}

export async function lockCandidates(db: Queryable, ids: Iterable<string>): Promise<void> {
  const sorted = sortedIds(ids);
  if (sorted.length === 0) return;
  await db.query("SELECT id FROM match_candidates WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE", [sorted]);
}

const endpointsOf = (c: PendingCandidate) => [c.missing_case_id, c.found_case_id];

export type Neighbourhood = { cases: Map<string, CaseRow>; pending: PendingCandidate[] };

// Locks `seeds` plus the other endpoint of every pending candidate on them (the reports
// whose queue state a decision or edit may change), all in one ascending pass, then
// locks those candidates. If a new pending candidate appeared between the unlocked read
// and the locks, the whole transaction is retried (LockSetChanged), so no lock is ever
// taken out of order.
export async function lockNeighbourhood(db: Queryable, seeds: Iterable<string>): Promise<Neighbourhood> {
  const seedIds = sortedIds(seeds);
  const before = await pendingCandidatesFor(db, seedIds);
  const cases = await lockCases(db, [...seedIds, ...before.flatMap(endpointsOf)]);
  const pending = await pendingCandidatesFor(db, seedIds);
  if (pending.some((c) => endpointsOf(c).some((id) => !cases.has(id)))) throw new LockSetChanged();
  await lockCandidates(
    db,
    pending.map((c) => c.id),
  );
  return { cases, pending };
}
