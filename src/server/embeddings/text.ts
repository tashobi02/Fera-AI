// TASK-016 / COMP-011: the canonical text we send to the embedder (P3-024).
//
// The brief: build the text from the structured contract fields only — never the
// raw free text — and make the function deterministic. The multilingual-e5-small
// model needs the `query: ` / `passage: ` prefix on every record; production policy
// (docs/execution/evidence/embedding-spike.md, "Production prefix policy") uses
// `query: ` on the missing/query side and `passage: ` on the found side, so a
// missing and a found report with the same fields will end up on opposite sides
// of the asymmetric prefix and never compare with cosine.
//
// Inputs are the same row the matcher reads; the row is the contract, not the
// parent's free text. Empty / null fields are dropped (joined with "। " so the
// tokeniser still sees a separator). The order is fixed so two equal rows produce
// the same text — that is the determinism guarantee the brief asks for.
//
// The functions here are pure and side-effect-free; they do not load the model
// and do not touch the database. The unit tests therefore never import the heavy
// `@huggingface/transformers` library.

import type { CaseKind } from "@/contracts/states";

/**
 * Structural subset of `CaseRow` these functions actually read. We accept a
 * `Pick<>` rather than `CaseRow` so a DB row that hasn't been projected to the
 * full contract (e.g. the SELECT inside `reembedAll`) is still assignable —
 * the matcher compares on the structured text only.
 */
export type EmbeddableCaseFields = {
  kind: CaseKind;
  clothing: string | null;
  marks: string | null;
  circumstances: string | null;
  place_text: string | null;
};

export const QUERY_PREFIX = "query: ";
export const PASSAGE_PREFIX = "passage: ";

/**
 * Pick the embedder prefix for a given case kind.
 * Missing reports go on the "query" side; found reports on the "passage" side.
 * Anything that is not "missing" or "found" is treated as a passage (the matcher
 * only compares missing vs found, and the schema restricts `kind` to those two).
 */
export function prefixForKind(kind: CaseKind): string {
  return kind === "missing" ? QUERY_PREFIX : PASSAGE_PREFIX;
}

type Part = { key: string; value: string | number | null | undefined };

/**
 * The structured fields we embed, in a fixed order. Adding a new field changes
 * the embedding space and forces a full re-embed; that is by design (TC-059).
 */
const FIELDS: readonly Part[] = [
  { key: "clothing", value: null },
  { key: "marks", value: null },
  { key: "circumstances", value: null },
  { key: "place_text", value: null },
];

function pick(row: EmbeddableCaseFields, key: string): string | null {
  const v = (row as unknown as Record<string, unknown>)[key];
  if (v === null || v === undefined) return null;
  if (typeof v === "string") {
    const t = v.trim();
    return t.length === 0 ? null : t;
  }
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

/**
 * Build the structured, deterministic description string for a case row.
 * Returns "" when the row has no embeddable fields, so callers can still get
 * a (zero) embedding back rather than refusing the row.
 */
export function structuredCaseText(row: EmbeddableCaseFields): string {
  const parts: string[] = [];
  for (const f of FIELDS) {
    const v = pick(row, f.key);
    if (v !== null) parts.push(v);
  }
  // "। " is the Bangla full stop + space; it gives the e5 tokeniser a clear
  // boundary even when the fields do not end in punctuation.
  return parts.join("। ");
}

/**
 * The full text to embed: prefix + structured description.
 * Pure; same input always produces the same output.
 */
export function canonicalCaseText(row: EmbeddableCaseFields): string {
  return prefixForKind(row.kind) + structuredCaseText(row);
}

/**
 * The bare prefix string. Exported so tests can assert the prefix policy
 * without rebuilding a row.
 */
export function canonicalPrefix(kind: CaseKind): string {
  return prefixForKind(kind);
}
