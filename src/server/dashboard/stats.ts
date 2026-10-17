// Dashboard aggregations (P3-041; TASK-030 part a; API-012/022; BR-014; TC-012, TC-055).
// Owner: Masnun. Server-only.
//
// - districtStats(db) returns one row per district with: code, name_bn, name_en,
//   lat, lng; missing counts by group {open, matched, closed}; found counts by
//   group {open, matched, referral_recorded}; one confirmed_pairs figure that
//   counts each confirmed pair once (BR-014, TC-055). Districts with no reported
//   cases still appear with zeros (API-012 "all 64 district rows including zeros").
//   Every cell is an SQL aggregate over the same dataset an independent GROUP BY
//   would produce; the DB test asserts equality.
// - listCasesForDistrict(db, query) returns the API-022 drill-through: cases
//   optionally filtered by district, kind and status group (BR-007/024; officer
//   gets a full per-role DTO row, admin gets the metadata-only row; the route's
//   per-role response schema is the allowlist). One cursor = the last id of the
//   previous page; the page is filtered to id < cursor to match the API-008
//   ordering documented in D2A.
//
// No DB triggers or stored procedures are used; all counts come from plain SQL so
// the test can compare them with independent GROUP BY queries over the same table
// in the same transaction. Queryable is the one shared seam (Pool or client); rows
// arrive as `unknown` and each cell is decoded with a typed check (decode.ts).

import { CASE_STATUSES, caseKindSchema, statusGroupSchema, toDhakaIso, type CaseKind, type CaseStatus, type StatusGroup, type Uuid } from "@/contracts";
import { col } from "@/server/db/decode";
import type { Queryable } from "@/server/db/queryable";

export type CountCells = {
  missing: { open: number; matched: number; closed: number };
  found: { open: number; matched: number; referral_recorded: number };
};

export type DistrictCountRow = {
  code: number;
  name_bn: string;
  name_en: string;
  lat: number;
  lng: number;
  missing_reports: CountCells["missing"];
  found_reports: CountCells["found"];
  confirmed_pairs: number;
};

export type CaseListQuery = {
  district?: string; // district_code as string (Queryable param: matches numeric coercion)
  kind?: CaseKind;
  status_group?: StatusGroup;
  cursor?: Uuid;
  limit?: number;
};

// Internal decoded shape for both kinds of list rows (officer and admin use the
// same five fields; the officer route projects a richer row via projectCaseListFor,
// the admin route narrows to the admin metadata shape at the schema boundary).
export type CaseListRow = {
  id: string;
  ref_code: string;
  kind: CaseKind;
  status: CaseStatus;
  status_group: StatusGroup;
  district_code: number | null;
  anonymised_at: string | null; // iso
  created_at: string;
};

export type CaseListResult = { rows: CaseListRow[]; nextCursor: string | null };

// List all 64 districts left-joined with the GROUP BY results so every district
// appears once even when its counts are zero. The GROUP BY uses a CASE clause on
// status so each row contributes to exactly one bucket; a pair-referral update
// changes found counts and confirmed_pairs (BR-014).
const STATS_SQL = `
  WITH d AS (SELECT code, name_bn, name_en, lat, lng FROM districts),
  m AS (
    SELECT district_code,
           count(*) FILTER (WHERE status IN ('submitted','open'))::int AS open_count,
           count(*) FILTER (WHERE status IN ('matched_pending_review','confirmed'))::int AS matched_count,
           count(*) FILTER (WHERE status = 'closed')::int AS closed_count
    FROM cases WHERE kind = 'missing' AND anonymised_at IS NULL
    GROUP BY district_code
  ),
  f AS (
    SELECT district_code,
           count(*) FILTER (WHERE status = 'open')::int AS open_count,
           count(*) FILTER (WHERE status = 'matched_pending_review')::int AS matched_count,
           count(*) FILTER (WHERE status = 'referred')::int AS referral_recorded
    FROM cases WHERE kind = 'found' AND anonymised_at IS NULL
    GROUP BY district_code
  ),
  p AS (
    SELECT m.district_code, count(*)::int AS pairs
    FROM match_candidates c JOIN cases m ON m.id = c.missing_case_id
    WHERE c.status = 'confirmed'
    GROUP BY m.district_code
  )
  SELECT d.code, d.name_bn, d.name_en, d.lat::float8 AS lat, d.lng::float8 AS lng,
         coalesce(m.open_count, 0)        AS missing_open,
         coalesce(m.matched_count, 0)     AS missing_matched,
         coalesce(m.closed_count, 0)      AS missing_closed,
         coalesce(f.open_count, 0)        AS found_open,
         coalesce(f.matched_count, 0)     AS found_matched,
         coalesce(f.referral_recorded, 0) AS found_referral,
         coalesce(p.pairs, 0)             AS pairs
  FROM d
  LEFT JOIN m ON m.district_code = d.code
  LEFT JOIN f ON f.district_code = d.code
  LEFT JOIN p ON p.district_code = d.code
  ORDER BY d.code
`;

// Same grouping as the displayed status_group below and the stats counts above (BR-014): a referred
// found report is "closed", a submitted missing report is still "open".
const STATUS_GROUP = {
  open: ["submitted", "open"],
  matched: ["matched_pending_review", "confirmed"],
  closed: ["closed", "referred"],
} as const satisfies Record<StatusGroup, readonly string[]>;

// Decode a single stat row from the join above. Throws if a column is the wrong
// type — the counts are int and the names are non-empty strings.
export function decodeDistrictRow(value: unknown): DistrictCountRow {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("district row: expected an object");
  }
  const r = value as Record<string, unknown>;
  const num = (c: string): number => {
    const v = r[c];
    if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`district row: ${c} is not a number`);
    return v;
  };
  const text = (c: string): string => {
    const v = r[c];
    if (typeof v !== "string" || v.length === 0) throw new Error(`district row: ${c} is not a string`);
    return v;
  };
  return {
    code: (() => { const v = r.code; if (typeof v !== "number") throw new Error("district row: code"); return v; })(),
    name_bn: text("name_bn"),
    name_en: text("name_en"),
    lat: num("lat"),
    lng: num("lng"),
    missing_reports: { open: num("missing_open"), matched: num("missing_matched"), closed: num("missing_closed") },
    found_reports: { open: num("found_open"), matched: num("found_matched"), referral_recorded: num("found_referral") },
    confirmed_pairs: num("pairs"),
  };
}

export async function districtStats(db: Queryable): Promise<DistrictCountRow[]> {
  const { rows } = await db.query(STATS_SQL);
  return rows.map((r) => decodeDistrictRow(r));
}

// Decode a case-list row. Schema matches what the dashboard listing uses: the
// fields shared between officer and admin views. Officer fields beyond these
// (child details, contact_phone_masked, etc.) are filled by projectCaseListFor
// from the full CaseRow, not here. Timestamps arrive as Date from node-pg (the
// cases columns are timestamptz); decode with col.dateOrNull and re-emit a
// +06:00 ISO string with toDhakaIso so the wire format matches the rest of the
// API surface (see src/server/case/rows.ts for the same pattern).
const T = "cases";

function readIsoRequired(r: Record<string, unknown>, c: string): string {
  const d = col.dateOrNull(T, r, c);
  if (d === null) throw new Error(`case row: ${c} is null`);
  return toDhakaIso(d.getTime());
}

function readIsoOrNull(r: Record<string, unknown>, c: string): string | null {
  const d = col.dateOrNull(T, r, c);
  return d === null ? null : toDhakaIso(d.getTime());
}

export function decodeCaseListRow(value: unknown): CaseListRow {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("case row: expected an object");
  }
  const r = value as Record<string, unknown>;
  const text = (c: string): string => {
    const v = r[c];
    if (typeof v !== "string") throw new Error(`case row: ${c} is not a string`);
    return v;
  };
  const numOrNull = (c: string): number | null => {
    const v = r[c];
    if (v === null || v === undefined) return null;
    if (typeof v !== "number") throw new Error(`case row: ${c} is not a number`);
    return v;
  };
  const kind = r.kind;
  if (kind !== "missing" && kind !== "found") throw new Error("case row: kind");
  const status = r.status;
  if (typeof status !== "string" || !(CASE_STATUSES as readonly string[]).includes(status)) throw new Error("case row: status");
  return {
    id: text("id"),
    ref_code: text("ref_code"),
    kind: caseKindSchema.parse(kind),
    status: status as CaseStatus,
    status_group: statusGroupSchema.parse(r.status_group),
    district_code: numOrNull("district_code"),
    anonymised_at: readIsoOrNull(r, "anonymised_at"),
    created_at: readIsoRequired(r, "created_at"),
  };
}

export async function listCasesForDistrict(db: Queryable, q: CaseListQuery): Promise<CaseListResult> {
  const limit = Math.min(Math.max(q.limit ?? 20, 1), 50);
  const params: unknown[] = [];
  const where: string[] = ["anonymised_at IS NULL"];
  if (q.district !== undefined) {
    params.push(q.district);
    where.push(`district_code = $${params.length}`);
  }
  if (q.kind !== undefined) {
    params.push(q.kind);
    where.push(`kind = $${params.length}`);
  }
  if (q.status_group !== undefined) {
    const statuses = STATUS_GROUP[q.status_group];
    params.push(statuses);
    where.push(`status = ANY($${params.length}::case_status[])`);
  }
  if (q.cursor !== undefined) {
    params.push(q.cursor);
    where.push(`id < $${params.length}`);
  }
  params.push(limit + 1);
  const limitParam = `$${params.length}`;
  const sql = `
    SELECT id, ref_code, kind, status, district_code,
           CASE WHEN kind='missing' AND status IN ('matched_pending_review','confirmed') THEN 'matched'
                WHEN kind='missing' AND status='closed' THEN 'closed'
                WHEN kind='missing' THEN 'open'
                WHEN status='referred' THEN 'closed'
                WHEN status='matched_pending_review' THEN 'matched'
                ELSE 'open'
           END AS status_group,
           created_at, anonymised_at
    FROM cases
    WHERE ${where.join(" AND ")}
    ORDER BY id DESC
    LIMIT ${limitParam}
  `;
  const { rows } = await db.query(sql, params);
  const all = rows.map(decodeCaseListRow);
  const page = all.length > limit ? all.slice(0, limit) : all;
  const nextCursor = all.length > limit ? page[page.length - 1].id : null;
  return { rows: page, nextCursor };
}

// API-012 totals: sum the 64 district rows. Mathematically the same as a single
// GROUP BY; the route uses this only after the response schema validates each
// district count, so the only thing this function does is sum without an extra
// query. It exists to keep the route handler one-liner readable.
export function totalsOf(stats: readonly DistrictCountRow[]): {
  missing_reports: CountCells["missing"];
  found_reports: CountCells["found"];
  confirmed_pairs: number;
} {
  const init: {
    missing_reports: CountCells["missing"];
    found_reports: CountCells["found"];
    confirmed_pairs: number;
  } = {
    missing_reports: { open: 0, matched: 0, closed: 0 },
    found_reports: { open: 0, matched: 0, referral_recorded: 0 },
    confirmed_pairs: 0,
  };
  for (const d of stats) {
    init.missing_reports.open += d.missing_reports.open;
    init.missing_reports.matched += d.missing_reports.matched;
    init.missing_reports.closed += d.missing_reports.closed;
    init.found_reports.open += d.found_reports.open;
    init.found_reports.matched += d.found_reports.matched;
    init.found_reports.referral_recorded += d.found_reports.referral_recorded;
    init.confirmed_pairs += d.confirmed_pairs;
  }
  return init;
}
