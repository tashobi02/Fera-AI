// TASK-016 / COMP-011 / P3-024: the text we send to the embedder.
//
// This module builds the deterministic text that gets embedded. The
// production policy comes from `docs/execution/evidence/embedding-spike.md`:
//   * `query: ` prefix on the missing/query side, `passage: ` on the found
//     side. The asymmetric prefix puts a missing report and a found report
//     with identical fields on opposite sides of the e5 prefix space, so
//     a missing and its true partner will not compare with cosine as
//     though they were both on the same side.
//   * Only the structured fields (clothing, marks, circumstances,
//     place_text, age, sex) are embedded. Free-text fields are scrubbed
//     of phone-like numbers (see FREE-TEXT SAFETY below). Names, phones,
//     district codes and identifying metadata are never embedded.
//   * The order of fields is fixed so two equal rows produce the same
//     text — that is the determinism guarantee the brief asks for.
//
// The function is pure and side-effect-free; it does not load the model
// and does not touch the database. The unit tests therefore never import
// the heavy `@huggingface/transformers` library.
//
// SUBMITTED CASES ONLY
//   The embedder and `npm run reembed` must only run on submitted cases
//   (rows of `cases`). Unreviewed intake drafts must never be embedded:
//   they live in `intake_drafts`, which the reembed query never reads
//   (tested in `tests/embeddings/submitted-only.test.ts`).
//
// KEEP STALE VECTORS OUT
//   Any code path that changes an embedded field (clothing, marks,
//   circumstances, place_text, sex, age_*) MUST clear `embedding`,
//   `embedding_model`, `embedding_revision` and `embedding_space` in the
//   same UPDATE. Anything that changes this file's output must bump
//   `TEXT_RECIPE` in `model.ts` (a golden test pins it).
//
// FREE-TEXT SAFETY
//   Only the name and phone FIELDS are left out. Free-text fields are
//   scrubbed of phone-like numbers (01 + 9 digits, ASCII or Bangla digits,
//   common separators, optional +880). Names typed into free text (for
//   example in circumstances) are NOT detected.
//
// SIMILARITY IS NOT A MATCH SIGNAL ALONE
//   Top-1 cosine does not separate a true no-match: in the TASK-004 spike
//   no-match top-1 cosine reached 0.96 while the weakest true pair was
//   0.90. Similarity is not a probability and must never be shown or used
//   as one.

import type { CaseKind } from "@/contracts/states";

/**
 * Structural subset of `CaseRow` these functions actually read. We accept
 * a `Pick<>` rather than `CaseRow` so a DB row that hasn't been projected
 * to the full contract (e.g. the SELECT inside `reembedAll`) is still
 * assignable — the matcher compares on the structured text only.
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
 * Pick the embedder prefix for a given case kind. Missing reports go on
 * the "query" side; found reports on the "passage" side. Anything that
 * is not "missing" or "found" is treated as a passage (the matcher only
 * compares missing vs found, and the schema restricts `kind` to those
 * two).
 */
export function prefixForKind(kind: CaseKind): string {
  return kind === "missing" ? QUERY_PREFIX : PASSAGE_PREFIX;
}

type Part = { key: string; value: string | number | null | undefined };

/**
 * The structured fields we embed, in a fixed order. Adding a new field
 * changes the embedding space and forces a full re-embed; that is by
 * design (TC-059).
 */
const FIELDS: readonly Part[] = [
  { key: "clothing", value: null },
  { key: "marks", value: null },
  { key: "circumstances", value: null },
  { key: "place_text", value: null },
];

/* ---------------------------------------------------------------- *
 * Phone scrubbing.                                                 *
 * ---------------------------------------------------------------- */

// Bangladeshi mobile numbers: 01 + 9 digits, or +880 / 880 + 1 + 9
// digits, with ASCII or Bangla digits and space, dot or hyphen
// separators between digits. Test in `tests/embeddings/text.test.ts`.
const D = "[0-9০-৯]";
const SEP = "[\\s.\\-]?";
const PHONE_LIKE = new RegExp(
  `(?<!${D})(?:\\+?(?:880|৮৮০)${SEP}[1১]|[0০]${SEP}[1১])(?:${SEP}${D}){9}(?!${D})`,
  "gu",
);

/**
 * Replace phone-like numbers in free text with a single space. The
 * surrounding space keeps words on either side of the matched run
 * separated, so a Bangla word glued to a phone number is not glued to
 * the next word after redaction.
 */
export function scrubPhones(s: string): string {
  return s.replace(PHONE_LIKE, " ").replace(/\s{2,}/gu, " ");
}

function pick(row: EmbeddableCaseFields, key: string): string | null {
  const v = (row as unknown as Record<string, unknown>)[key];
  if (v === null || v === undefined) return null;
  if (typeof v === "string") {
    const t = scrubPhones(v.normalize("NFC")).replace(/\s+/g, " ").trim();
    return t.length === 0 ? null : t;
  }
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

/**
 * Build the structured, deterministic description string for a case row.
 * Returns "" when the row has no embeddable fields, so callers can still
 * get a (zero) embedding back rather than refusing the row. Phone-like
 * numbers inside the free-text fields are scrubbed at `pick` time.
 */
export function structuredCaseText(row: EmbeddableCaseFields): string {
  const parts: string[] = [];
  for (const f of FIELDS) {
    const v = pick(row, f.key);
    if (v !== null) parts.push(v);
  }
  // "। " is the Bangla full stop + space; it gives the e5 tokeniser a
  // clear boundary even when the fields do not end in punctuation.
  return parts.join("। ");
}

/**
 * Prefix-free text used by the reembed worker. The caller selects the
 * query/passage role from `kind`; `embedOneText` adds that prefix exactly
 * once at the model boundary.
 */
export function caseEmbeddingText(row: EmbeddableCaseFields): string {
  return structuredCaseText(row);
}

/**
 * The full text to embed: prefix + structured description. Pure; same
 * input always produces the same output.
 */
export function canonicalCaseText(row: EmbeddableCaseFields): string {
  return prefixForKind(row.kind) + structuredCaseText(row);
}

/**
 * The bare prefix string. Exported so tests can assert the prefix
 * policy without rebuilding a row.
 */
export function canonicalPrefix(kind: CaseKind): string {
  return prefixForKind(kind);
}
