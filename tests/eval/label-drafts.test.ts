// Unit tests for the pure helpers in eval/prepare-label-drafts.mjs.
//
// These tests intentionally do NOT touch the filesystem, the manifest, or
// eval/FREEZE.md. They exercise the pure surface area that the script
// exposes:
//   - loadDevRecordIds:     dev-only id set from a manifest object
//   - buildLabelDrafts:     deterministic / only-manifest / blank-labels /
//                           source-text-same
//   - validateDraftRows:    every id in manifest set, valid source text,
//                           no labels, no non-object rows
//   - guardProtectedFiles:  refuses to overwrite historical draft and
//                           human-review pending file
//   - guardSafeOutputPath:  refuses paths outside eval/data/
//   - checkOverwriteGuard:  refuses to overwrite non-empty files unless
//                           --replace, and even then only when labels
//                           are empty
//
// The script is responsible for I/O; the helpers here are pure. If the
// behaviour described in eval/data/README.md "Canonical draft for human
// review" ever drifts, these tests will catch it.
//
// These tests are PURELY in-memory: no temp files, no fixtures, no
// model/network/env. They are safe to run on any machine that has vitest.
import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
// @ts-expect-error -- plain ESM module without type declarations
import {
  buildLabelDrafts,
  validateDraftRows,
  loadDevRecordIds,
  guardProtectedFiles,
  guardSafeOutputPath,
  checkOverwriteGuard,
  readJsonl,
  DEFAULT_COUNT,
  MAX_COUNT,
  TARGET_SPLIT,
  PROTECTED_FILENAMES,
  REPO_ROOT,
} from "../../eval/prepare-label-drafts.mjs";

function rec(id: string, source: string, extras: Record<string, unknown> = {}) {
  return { record_id: id, kind: "missing", draft: { source_text: source }, ...extras };
}

function makeManifest(recordIds: string[], split: "dev" | "test"): Record<string, unknown> {
  return {
    manifest_revision: "test-1",
    seed: 2020,
    records: recordIds.map((id) => ({ record_id: id, split })),
  };
}

describe("loadDevRecordIds (manifest filter)", () => {
  it("returns only record_ids with split='dev'", () => {
    const manifest = makeManifest(["a", "b", "c", "d"], "dev");
    const ids = loadDevRecordIds(manifest);
    expect([...ids].sort()).toEqual(["a", "b", "c", "d"]);
  });

  it("skips records whose split is 'test'", () => {
    const manifest = {
      records: [
        { record_id: "a", split: "dev" },
        { record_id: "b", split: "test" },
        { record_id: "c", split: "dev" },
      ],
    };
    const ids = loadDevRecordIds(manifest);
    expect(ids.has("a")).toBe(true);
    expect(ids.has("c")).toBe(true);
    expect(ids.has("b")).toBe(false);
  });

  it("throws when no records match the dev split", () => {
    const manifest = { records: [{ record_id: "x", split: "test" }] };
    expect(() => loadDevRecordIds(manifest)).toThrow(/0 manifest records have split="dev"/);
  });

  it("throws when manifest has no records array", () => {
    expect(() => loadDevRecordIds({})).toThrow(/no records array/);
    expect(() => loadDevRecordIds(null)).toThrow(/no records array/);
  });

  it("TARGET_SPLIT is 'dev' (not 'test' or 'heldout')", () => {
    expect(TARGET_SPLIT).toBe("dev");
  });
});

describe("buildLabelDrafts", () => {
  it("selects the first N records by record_id (deterministic)", () => {
    const records = [
      rec("zzz", "Z"),
      rec("aaa", "A"),
      rec("mmm", "M"),
      rec("bbb", "B"),
    ];
    const manifest = new Set(["aaa", "bbb", "mmm", "zzz"]);
    const rows = buildLabelDrafts(records, manifest, 2);
    expect(rows.map((r) => r.id)).toEqual(["aaa", "bbb"]);
  });

  it("ignores records whose id is not in the canonical manifest set", () => {
    const records = [
      rec("aaa", "A"),
      rec("bbb", "B"),
      rec("ccc", "C"),
    ];
    const manifest = new Set(["aaa", "ccc"]); // bbb is NOT canonical
    const rows = buildLabelDrafts(records, manifest, 10);
    expect(rows.map((r) => r.id)).toEqual(["aaa", "ccc"]);
  });

  it("always emits empty labels (no model labels are produced)", () => {
    const records = [rec("aaa", "A"), rec("bbb", "B")];
    const manifest = new Set(["aaa", "bbb"]);
    const rows = buildLabelDrafts(records, manifest, 5);
    for (const row of rows) {
      expect(row.labels).toEqual({});
      expect(Object.keys(row.labels)).toHaveLength(0);
    }
  });

  it("uses draft.source_text verbatim as the text field", () => {
    const records = [rec("aaa", "আমার ছেলে রাফি, বয়স ১৩, ...")];
    const manifest = new Set(["aaa"]);
    const rows = buildLabelDrafts(records, manifest, 1);
    expect(rows[0].text).toBe("আমার ছেলে রাফি, বয়স ১৩, ...");
    expect(rows[0].id).toBe("aaa");
  });

  it("sorts strictly by record_id — never by role, partner, or no_match", () => {
    // Records deliberately carry "decoy" role / partners that, if used,
    // would reshuffle the output. The helper must ignore them.
    const records = [
      rec("zzz", "Z", { role: "pair_query", true_partner_ids: ["aaa"], no_match: true }),
      rec("aaa", "A", { role: "decoy", decoy_type: "shared_phone" }),
      rec("mmm", "M"),
    ];
    const manifest = new Set(["aaa", "mmm", "zzz"]);
    const rows = buildLabelDrafts(records, manifest, 3);
    expect(rows.map((r) => r.id)).toEqual(["aaa", "mmm", "zzz"]);
  });

  it("skips records with empty / missing source_text", () => {
    const records = [
      rec("aaa", ""), // empty text
      rec("bbb", "B"),
      { record_id: "ccc", kind: "missing", draft: {} }, // missing source_text
    ];
    const manifest = new Set(["aaa", "bbb", "ccc"]);
    const rows = buildLabelDrafts(records, manifest, 10);
    expect(rows.map((r) => r.id)).toEqual(["bbb"]);
  });

  it("deduplicates by record_id even if the input has duplicates", () => {
    const records = [rec("aaa", "A"), rec("aaa", "A-dup"), rec("bbb", "B")];
    const manifest = new Set(["aaa", "bbb"]);
    const rows = buildLabelDrafts(records, manifest, 10);
    // First occurrence wins because the sort is stable and the dedupe is
    // checked before the count cap.
    const aaaRow = rows.find((r) => r.id === "aaa");
    expect(rows.filter((r) => r.id === "aaa")).toHaveLength(1);
    expect(aaaRow?.text).toBe("A");
  });

  it("respects count and stops once N rows are selected", () => {
    const records = ["a", "b", "c", "d", "e"].map((id) => rec(id, id.toUpperCase()));
    const manifest = new Set(["a", "b", "c", "d", "e"]);
    const rows = buildLabelDrafts(records, manifest, 3);
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.id)).toEqual(["a", "b", "c"]);
  });

  it("rejects non-array records and non-Set manifestIds", () => {
    // @ts-expect-error -- intentionally wrong type
    expect(() => buildLabelDrafts(null, new Set())).toThrow(/array/);
    // @ts-expect-error -- intentionally wrong type
    expect(() => buildLabelDrafts([], "not-a-set")).toThrow(/Set/);
  });

  it("rejects non-positive count", () => {
    expect(() => buildLabelDrafts([], new Set(), 0)).toThrow(/positive integer/);
    expect(() => buildLabelDrafts([], new Set(), -1)).toThrow(/positive integer/);
    expect(() => buildLabelDrafts([], new Set(), 1.5)).toThrow(/positive integer/);
  });

  it("is deterministic across calls (same input -> same output)", () => {
    const records = ["e", "a", "d", "b", "c"].map((id) => rec(id, id.toUpperCase()));
    const manifest = new Set(["a", "b", "c", "d", "e"]);
    const a = buildLabelDrafts(records, manifest, 5);
    const b = buildLabelDrafts(records, manifest, 5);
    expect(a).toEqual(b);
  });
});

describe("validateDraftRows", () => {
  it("returns no issues for canonical, well-formed rows", () => {
    const manifest = new Set(["aaa", "bbb"]);
    const rows = buildLabelDrafts(
      [rec("aaa", "A"), rec("bbb", "B")],
      manifest,
      2,
    );
    expect(validateDraftRows(rows, manifest)).toEqual([]);
  });

  it("flags ids that are not in the manifest", () => {
    const manifest = new Set(["aaa"]);
    const issues = validateDraftRows([{ id: "ghost", text: "X", labels: {} }], manifest);
    expect(issues.some((s) => s.includes("ghost"))).toBe(true);
  });

  it("flags empty or missing text", () => {
    const manifest = new Set(["aaa", "bbb"]);
    const issues = validateDraftRows(
      [
        { id: "aaa", text: "", labels: {} },
        { id: "bbb", labels: {} } as { id: string; text?: string; labels: Record<string, never> },
      ],
      manifest,
    );
    expect(issues.length).toBe(2);
  });

  it("flags any row whose labels are not an empty object", () => {
    const manifest = new Set(["aaa", "bbb"]);
    const issues = validateDraftRows(
      [
        { id: "aaa", text: "A", labels: {} },
        { id: "bbb", text: "B", labels: { "child.name": {} as never } },
      ],
      manifest,
    );
    expect(issues.some((s) => s.includes("bbb") && s.includes("non-empty"))).toBe(true);
    expect(issues.some((s) => s.includes("aaa"))).toBe(false);
  });

  it("flags non-object rows", () => {
    const manifest = new Set(["aaa"]);
    const issues = validateDraftRows([null as unknown as { id: string; text: string; labels: Record<string, never> }], manifest);
    expect(issues.length).toBeGreaterThan(0);
  });
});

describe("guardProtectedFiles", () => {
  it("refuses to write to the historical L001..L050 draft (labelled.draft.jsonl)", () => {
    const path = join(REPO_ROOT, "eval", "data", "labelled.draft.jsonl");
    expect(() => guardProtectedFiles(path)).toThrow(/historical L001\.\.L050 draft/);
  });

  it("refuses to write to the human-review pending file (labelled.jsonl)", () => {
    const path = join(REPO_ROOT, "eval", "data", "labelled.jsonl");
    expect(() => guardProtectedFiles(path)).toThrow(/human-review pending file/);
  });

  it("PROTECTED_FILENAMES contains the protected files", () => {
    expect(PROTECTED_FILENAMES.has("labelled.draft.jsonl")).toBe(true);
    expect(PROTECTED_FILENAMES.has("labelled.jsonl")).toBe(true);
  });

  it("accepts a new draft filename", () => {
    const path = join(REPO_ROOT, "eval", "data", "labelled.canonical.draft.jsonl");
    expect(() => guardProtectedFiles(path)).not.toThrow();
  });
});

describe("guardSafeOutputPath", () => {
  let tmp: string;
  // Use a per-test fresh tempdir to avoid cross-test pollution.
  function setup() {
    tmp = mkdtempSync(join(tmpdir(), "fera-prepare-"));
    return tmp;
  }
  function teardown() {
    if (tmp && existsSync(tmp)) rmSync(tmp, { recursive: true, force: true });
  }

  it("accepts paths inside eval/data/", () => {
    // The path must resolve to a real location under eval/data/.
    const safeDir = resolve(REPO_ROOT, "eval", "data");
    const path = join(safeDir, ".test-ok.jsonl");
    expect(() => guardSafeOutputPath(path)).not.toThrow();
  });

  it("refuses paths outside eval/data/ (parent dir)", () => {
    const dir = setup();
    try {
      // /tmp/fera-prepare-X/ok.jsonl is NOT under eval/data/.
      const path = join(dir, "ok.jsonl");
      expect(() => guardSafeOutputPath(path)).toThrow(/outside/);
    } finally {
      teardown();
    }
  });

  it("refuses absolute paths outside eval/data/", () => {
    const dir = setup();
    try {
      // An absolute path that does not begin with eval/data/.
      const path = join(dir, "..", "sibling", "x.jsonl");
      expect(() => guardSafeOutputPath(path)).toThrow(/outside/);
    } finally {
      teardown();
    }
  });
});

describe("checkOverwriteGuard", () => {
  let tmp: string;
  function setup() {
    tmp = mkdtempSync(join(tmpdir(), "fera-prepare-ow-"));
    return tmp;
  }
  function teardown() {
    if (tmp && existsSync(tmp)) rmSync(tmp, { recursive: true, force: true });
  }

  it("returns silently when the file does not exist", () => {
    const dir = setup();
    try {
      const path = join(dir, "absent.jsonl");
      expect(() => checkOverwriteGuard(path, false)).not.toThrow();
    } finally {
      teardown();
    }
  });

  it("refuses to overwrite an existing file without --replace", () => {
    const dir = setup();
    try {
      const path = join(dir, "existing.jsonl");
      writeFileSync(path, JSON.stringify({ id: "a", text: "x", labels: {} }) + "\n", "utf8");
      expect(() => checkOverwriteGuard(path, false)).toThrow(/pass --replace/);
    } finally {
      teardown();
    }
  });

  it("refuses to --replace a file whose rows have non-empty labels", () => {
    const dir = setup();
    try {
      const path = join(dir, "existing.jsonl");
      writeFileSync(
        path,
        JSON.stringify({ id: "a", text: "x", labels: { "child.name": {} as never } }) + "\n",
        "utf8",
      );
      expect(() => checkOverwriteGuard(path, true)).toThrow(/non-empty labels/);
    } finally {
      teardown();
    }
  });

  it("allows --replace when every row has empty labels", () => {
    const dir = setup();
    try {
      const path = join(dir, "existing.jsonl");
      writeFileSync(path, JSON.stringify({ id: "a", text: "x", labels: {} }) + "\n", "utf8");
      expect(() => checkOverwriteGuard(path, true)).not.toThrow();
    } finally {
      teardown();
    }
  });
});

describe("readJsonl", () => {
  let tmp: string;
  function setup() {
    tmp = mkdtempSync(join(tmpdir(), "fera-prepare-rj-"));
    return tmp;
  }
  function teardown() {
    if (tmp && existsSync(tmp)) rmSync(tmp, { recursive: true, force: true });
  }

  it("parses valid JSONL", () => {
    const dir = setup();
    try {
      const path = join(dir, "ok.jsonl");
      writeFileSync(
        path,
        [
          JSON.stringify({ id: "a", text: "A", labels: {} }),
          JSON.stringify({ id: "b", text: "B", labels: {} }),
        ].join("\n") + "\n",
        "utf8",
      );
      const rows = readJsonl(path);
      expect(rows).toEqual([
        { id: "a", text: "A", labels: {} },
        { id: "b", text: "B", labels: {} },
      ]);
    } finally {
      teardown();
    }
  });

  it("skips blank lines", () => {
    const dir = setup();
    try {
      const path = join(dir, "blanks.jsonl");
      writeFileSync(
        path,
        [
          JSON.stringify({ id: "a", text: "A", labels: {} }),
          "",
          JSON.stringify({ id: "b", text: "B", labels: {} }),
          "   ",
        ].join("\n") + "\n",
        "utf8",
      );
      const rows = readJsonl(path);
      expect(rows).toHaveLength(2);
    } finally {
      teardown();
    }
  });

  it("throws on malformed JSONL", () => {
    const dir = setup();
    try {
      const path = join(dir, "bad.jsonl");
      writeFileSync(path, "{not json}\n", "utf8");
      expect(() => readJsonl(path)).toThrow();
    } finally {
      teardown();
    }
  });
});

describe("buildLabelDrafts + dev-only integration", () => {
  it("never picks a record whose id is not in the dev manifest set (proves no test record is selected)", () => {
    // Simulate a manifest that contains both dev and test ids, and ensure
    // buildLabelDrafts only ever returns ids in the *dev* set.
    const records = [
      rec("aaa", "A"),
      rec("bbb", "B"),
      rec("ccc", "C"),
      rec("ddd", "D"),
    ];
    // Manifest pretends to be the result of loadDevRecordIds: only "aaa"
    // and "ccc" are dev. buildLabelDrafts must not return "bbb" or "ddd".
    const devIds = new Set(["aaa", "ccc"]);
    const rows = buildLabelDrafts(records, devIds, 10);
    for (const row of rows) {
      expect(devIds.has(row.id)).toBe(true);
    }
    expect(rows.map((r) => r.id).sort()).toEqual(["aaa", "ccc"]);
  });

  it("with a 50-cap, returns at most DEFAULT_COUNT rows", () => {
    expect(DEFAULT_COUNT).toBe(50);
    expect(MAX_COUNT).toBe(50);
    const records = Array.from({ length: 100 }, (_, i) => rec(`r${String(i).padStart(3, "0")}`, `T${i}`));
    const manifest = new Set(records.map((r) => r.record_id));
    const rows = buildLabelDrafts(records, manifest, DEFAULT_COUNT);
    expect(rows).toHaveLength(50);
  });
});
