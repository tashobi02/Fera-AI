// Typed per-column row decoding (TASK-015; src/server/case, src/server/audit). Database rows arrive as `unknown`; each column
// is checked for its expected type, and a mismatch throws RowShapeError naming only the
// table and column (never the value). That error becomes E-021 at the API layer.
import { isUuid } from "@/contracts";

export class RowShapeError extends Error {
  constructor(readonly table: string, readonly column: string) {
    super(`unexpected ${table}.${column} shape`);
    this.name = "RowShapeError";
  }
}

export type Raw = Record<string, unknown>;

export function asRow(table: string, value: unknown): Raw {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new RowShapeError(table, "*");
  return value as Raw;
}

export function firstRow(table: string, rows: readonly unknown[]): Raw | null {
  return rows.length === 0 ? null : asRow(table, rows[0]);
}

export const col = {
  uuid(table: string, r: Raw, c: string): string {
    const v = r[c];
    if (!isUuid(v)) throw new RowShapeError(table, c);
    return v.toLowerCase();
  },
  uuidOrNull(table: string, r: Raw, c: string): string | null {
    return r[c] === null || r[c] === undefined ? null : col.uuid(table, r, c);
  },
  text(table: string, r: Raw, c: string): string {
    const v = r[c];
    if (typeof v !== "string") throw new RowShapeError(table, c);
    return v;
  },
  textOrNull(table: string, r: Raw, c: string): string | null {
    return r[c] === null || r[c] === undefined ? null : col.text(table, r, c);
  },
  int(table: string, r: Raw, c: string): number {
    const v = r[c];
    if (typeof v !== "number" || !Number.isSafeInteger(v)) throw new RowShapeError(table, c);
    return v;
  },
  intOrNull(table: string, r: Raw, c: string): number | null {
    return r[c] === null || r[c] === undefined ? null : col.int(table, r, c);
  },
  // bigint / numeric arrive as strings from pg.
  numeric(table: string, r: Raw, c: string): number {
    const v = r[c];
    const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : Number.NaN;
    if (!Number.isFinite(n)) throw new RowShapeError(table, c);
    return n;
  },
  bool(table: string, r: Raw, c: string): boolean {
    const v = r[c];
    if (typeof v !== "boolean") throw new RowShapeError(table, c);
    return v;
  },
  // timestamptz arrives as a Date from pg (an ISO string with an explicit offset is
  // accepted too, for typed fakes).
  dateOrNull(table: string, r: Raw, c: string): Date | null {
    const v = r[c];
    if (v === null || v === undefined) return null;
    const d = v instanceof Date ? v : typeof v === "string" && /(Z|[+-]\d{2}:\d{2})$/.test(v) ? new Date(v) : null;
    if (!d || Number.isNaN(d.getTime())) throw new RowShapeError(table, c);
    return d;
  },
  oneOf<T extends string>(table: string, r: Raw, c: string, allowed: readonly T[]): T {
    const v = r[c];
    if (typeof v !== "string" || !(allowed as readonly string[]).includes(v)) throw new RowShapeError(table, c);
    return v as T;
  },
  oneOfOrNull<T extends string>(table: string, r: Raw, c: string, allowed: readonly T[]): T | null {
    return r[c] === null || r[c] === undefined ? null : col.oneOf(table, r, c, allowed);
  },
  object(table: string, r: Raw, c: string): Record<string, unknown> {
    const v = r[c];
    if (typeof v !== "object" || v === null || Array.isArray(v)) throw new RowShapeError(table, c);
    return v as Record<string, unknown>;
  },
};
