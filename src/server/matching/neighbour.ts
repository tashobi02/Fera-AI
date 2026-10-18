// TASK-017d: district neighbour lookup for the matcher's district component (D1 BR-018,
// A-028 "district 0.10 weight"). Owner: Masnun.
//
// The brief: when the missing case's `district_code` matches the found's exactly, the
// `districtSame` axis is true; when the two codes are listed in `district_neighbours`,
// the `districtNeighbour` axis is true; otherwise both are false. `null` on either side
// (no district recorded) makes the whole component null and the score weight is dropped
// (BR-018, A-028).
//
// `districtNeighbourFor(db, missingCode, foundCode)` answers the single question the
// matcher needs: "are these two district codes neighbours?". It pre-loads the neighbour
// set for the missing side (the smaller of the two in the common case) and answers
// in-memory; the alternative is a join per candidate, which the spec expressly avoided.
import type { Queryable } from "@/server/db/queryable";

const NEIGHBOUR_SQL = `
  SELECT neighbour_code FROM district_neighbours
  WHERE district_code = ANY($1::smallint[])`;

export async function loadNeighbourSet(
  db: Queryable,
  districtCodes: readonly number[],
): Promise<Set<number>> {
  if (districtCodes.length === 0) return new Set();
  const { rows } = await db.query(NEIGHBOUR_SQL, [districtCodes]);
  const out = new Set<number>();
  for (const r of rows) {
    const code = (r as { neighbour_code?: unknown }).neighbour_code;
    if (typeof code === "number" && Number.isFinite(code)) out.add(code);
  }
  return out;
}

export function districtNeighbourFor(
  missingCode: number | null,
  foundCode: number | null,
  neighbourSet: ReadonlySet<number>,
): boolean | null {
  if (missingCode === null || foundCode === null) return null;
  if (missingCode === foundCode) return false; // same is not neighbour
  return neighbourSet.has(foundCode);
}
