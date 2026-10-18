// Type declarations for eval/prepare-label-drafts.mjs.
//
// The script is plain ESM (.mjs) with no built-in type surface. These
// declarations match the runtime signatures one-to-one so that
// tests/eval/label-drafts.test.ts (and any other consumer) can import
// the named exports with full type checking.
//
// Shapes used here are intentionally minimal: this helper family
// validates user/IO-supplied data, so the public surface treats its
// inputs as `unknown` and returns a small, well-typed result shape
// (LabelDraftRow). Validation functions (validateDraftRows) take
// `unknown` rows and return string[] issue lists; callers are expected
// to cast / narrow as needed.

/** A row in the labelled.canonical.draft.jsonl output. */
export interface LabelDraftRow {
  id: string;
  text: string;
  labels: Record<string, never>;
}

/** A row from data/synthetic/records.jsonl — only the fields this
 *  helper actually reads are typed; everything else is unknown. */
export interface RecordRow {
  record_id?: unknown;
  draft?: { source_text?: unknown } & Record<string, unknown>;
  [key: string]: unknown;
}

/** A row from eval/manifest.json — only the fields this helper
 *  actually reads are typed. */
export interface ManifestRow {
  record_id?: unknown;
  split?: unknown;
  [key: string]: unknown;
}

/** Shape of the parsed eval/manifest.json file. */
export interface ManifestJson {
  records?: unknown;
  [key: string]: unknown;
}

/** Options accepted by runPrepareLabelDrafts. */
export interface RunPrepareLabelDraftsOptions {
  out?: string;
  replace?: boolean;
  count?: number;
  recordsPath?: string;
  manifestPath?: string;
}

/** Result returned by runPrepareLabelDrafts on success. */
export interface PrepareLabelDraftsResult {
  path: string;
  count: number;
  selectedIds: string[];
}

export const REPO_ROOT: string;
export const DEFAULT_COUNT: number;
export const MAX_COUNT: number;
export const TARGET_SPLIT: "dev";
export const PROTECTED_FILENAMES: Set<string>;

/** Read the records.jsonl stream as an array of objects. The runtime
 *  returns whatever JSON.parse yields; we surface it as unknown[] so
 *  callers narrow per-row. */
export function readRecords(path: string): Promise<unknown[]>;

/** Select the first `count` records (sorted by record_id) whose
 *  record_id is in `manifestIds` and whose `draft.source_text` is
 *  non-empty. Throws on non-array records, non-Set manifestIds, or
 *  non-positive count. */
export function buildLabelDrafts(
  records: unknown,
  manifestIds: Set<string>,
  count?: number,
): LabelDraftRow[];

/** Validate that every id in the proposed output is in the manifest
 *  set and the source text is non-empty. Returns the list of issues
 *  (empty list = ok). */
export function validateDraftRows(rows: unknown, manifestIds: Set<string>): string[];

/** Build the dev-only set of record_ids from the canonical manifest.
 *  Throws if any record is missing a split value or if no records
 *  match the dev split. */
export function loadDevRecordIds(manifestJson: unknown): Set<string>;

/** Read an existing JSONL file; return rows. Throws on parse error. */
export function readJsonl(path: string): unknown[];

/** Refuse to overwrite the historical L001..L050 draft or the
 *  human-review pending labelled.jsonl under any flag. */
export function guardProtectedFiles(targetPath: string): void;

/** Restrict output to within eval/data/ unless explicitly allowed. */
export function guardSafeOutputPath(targetPath: string): void;

/** Decide whether we may overwrite the existing target file. */
export function checkOverwriteGuard(targetPath: string, replace: boolean): void;

/** Top-level orchestrator: read manifest + records, build & validate
 *  draft rows, write to disk. */
export function runPrepareLabelDrafts(
  options?: RunPrepareLabelDraftsOptions,
): Promise<PrepareLabelDraftsResult>;
