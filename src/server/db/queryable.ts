// The one query seam the server modules share (a pg Pool or PoolClient satisfies it).
// Rows are `unknown`: callers decode them with typed per-column checks
// (src/server/case/decode.ts), never with a cast.
export type Queryable = {
  query(text: string, values?: unknown[]): Promise<{ rows: unknown[] }>;
};
