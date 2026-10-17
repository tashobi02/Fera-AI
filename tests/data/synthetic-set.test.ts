// TASK-010: the synthetic set matches A-039, is internally consistent (BR-026) and does not leak
// its own answers through ids, order, phones or text variants (RISK-007).
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { foundSubmissionDraftSchema, missingSubmissionDraftSchema } from "../../src/contracts/draft";
// @ts-expect-error -- plain ESM module without type declarations
import { loadDistrictData } from "../../db/seed/districts.mjs";
// @ts-expect-error -- plain ESM module without type declarations
import { outputs } from "../../db/seed/synthetic.mjs";

const dir = join(process.cwd(), "data", "synthetic");
const read = (n: string) => readFileSync(join(dir, n), "utf8");
const sha = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");

type Draft = {
  kind: "missing" | "found"; source_text: string;
  child: { name: string | null; sex: string; clothing: string | null; marks: string | null; age_years: number | null; age_min: number | null; age_max: number | null };
  event: { at: string; place_text: string; district_code: number };
  reporter: { phone: string };
};
type Rec = { record_id: string; kind: "missing" | "found"; is_synthetic: boolean; draft: Draft };
type Row = {
  record_id: string; label: string; kind: "missing" | "found"; role: string; identity_id: string; duplicate_group_id: string | null; split_group_id: string;
  true_partner_ids: string[]; no_match: boolean; decoy_type: string | null; decoy_target_ids: string[]; source_variant: string; demo_role: string | null;
  phone_shared_with_other_identities: string[];
};
const records: Rec[] = read("records.jsonl").trim().split("\n").map((l) => JSON.parse(l));
const gt = JSON.parse(read("ground_truth.json")) as { counts: Record<string, number>; inputs: { districts_json_sha256: string }; records: Row[] };
const rows = gt.records;
const byId = new Map(rows.map((r) => [r.record_id, r]));
const recById = new Map(records.map((r) => [r.record_id, r]));
const districts = loadDistrictData().districts as { code: number; neighbours: number[] }[];
const near = (a: number, b: number) => a === b || districts.find((d) => d.code === a)!.neighbours.includes(b);
const mid = (c: Draft["child"]) => (c.age_years ?? ((c.age_min ?? NaN) + (c.age_max ?? NaN)) / 2);

describe("synthetic set (A-039)", () => {
  it("has the declared composition and denominators", () => {
    expect(gt.counts).toMatchObject({
      total: 200, missing_canonical: 80, found_canonical: 80, decoys: 40, true_pairs: 60,
      no_match_queries: 20, duplicate_links: 25, shared_phone_decoys: 7, no_match_identities: 15, pair_identities_with_duplicate_found: 20,
    });
    expect(records).toHaveLength(200);
    expect(rows).toHaveLength(200);
  });

  it("is committed byte-for-byte as the generator produces it", () => {
    for (const [name, content] of Object.entries(outputs() as Record<string, string>)) expect(read(name), name).toBe(content);
  });

  it("is deterministic across two runs", () => {
    expect(outputs()).toEqual(outputs());
  });

  it("hashes both files and pins the districts.json input", () => {
    expect(read("ground_truth.sha256")).toBe(`${sha(read("ground_truth.json"))}  ground_truth.json\n`);
    expect(read("records.sha256")).toBe(`${sha(read("records.jsonl"))}  records.jsonl\n`);
    expect(gt.inputs.districts_json_sha256).toBe(sha(readFileSync(join(process.cwd(), "data", "districts.json"))));
  });

  it("labels every record synthetic with unique ids, in the same order in both files", () => {
    expect(records.every((r) => r.is_synthetic === true)).toBe(true);
    expect(new Set(records.map((r) => r.record_id)).size).toBe(200);
    expect(new Set(rows.map((r) => r.label)).size).toBe(200);
    expect(records.map((r) => r.record_id)).toEqual(rows.map((r) => r.record_id));
  });

  it("every draft parses with its submission schema (so the seed loader can submit it)", () => {
    for (const r of records) {
      const schema = r.kind === "missing" ? missingSubmissionDraftSchema : foundSubmissionDraftSchema;
      const parsed = schema.safeParse(r.draft);
      expect(parsed.success, `${r.record_id}: ${parsed.success ? "" : JSON.stringify(parsed.error.issues)}`).toBe(true);
    }
  });

  it("uses only the fictional phone block, with no photo or coordinate key", () => {
    for (const r of records) {
      expect(r.draft.reporter.phone).toMatch(/^0120000\d{4}$/);
      expect(JSON.stringify(r)).not.toMatch(/"(photo|image|lat|lng|latitude|longitude|coordinates)"\s*:/i);
    }
  });
});

describe("ground truth consistency", () => {
  it("true pairs and partners are symmetric, same identity, opposite kinds", () => {
    expect(new Set(rows.filter((r) => r.role === "pair_query").map((r) => r.identity_id)).size).toBe(60);
    for (const r of rows) {
      for (const pid of r.true_partner_ids) {
        expect(byId.has(pid), `${r.label} partner ${pid}`).toBe(true);
        const p = byId.get(pid)!;
        expect(p.kind).not.toBe(r.kind);
        expect(p.identity_id).toBe(r.identity_id);
        expect(p.true_partner_ids).toContain(r.record_id);
      }
      if (r.role === "pair_query") expect(r.true_partner_ids.length).toBeGreaterThanOrEqual(1);
      if (r.no_match) expect(r.true_partner_ids).toEqual([]);
    }
  });

  it("no-match queries have no found record of the same identity", () => {
    const nm = rows.filter((r) => r.kind === "missing" && r.no_match);
    expect(nm).toHaveLength(20);
    for (const r of nm) expect(rows.some((o) => o.kind === "found" && o.identity_id === r.identity_id)).toBe(false);
  });

  it("duplicate groups are two same-identity, same-kind records (20 found, 5 missing)", () => {
    const groups = new Map<string, Row[]>();
    for (const r of rows) if (r.duplicate_group_id) groups.set(r.duplicate_group_id, [...(groups.get(r.duplicate_group_id) ?? []), r]);
    expect(groups.size).toBe(25);
    for (const g of groups.values()) {
      expect(g).toHaveLength(2);
      expect(g[0].kind).toBe(g[1].kind);
      expect(g[0].identity_id).toBe(g[1].identity_id);
    }
    const kinds = [...groups.values()].map((g) => g[0].kind);
    expect(kinds.filter((k) => k === "found")).toHaveLength(20);
    expect(kinds.filter((k) => k === "missing")).toHaveLength(5);
  });

  it("split groups keep identities, duplicates, partners and decoy+target together", () => {
    const groupOf = (id: string) => byId.get(id)!.split_group_id;
    for (const r of rows) {
      for (const id of [...r.true_partner_ids, ...r.decoy_target_ids]) expect(groupOf(id)).toBe(r.split_group_id);
      for (const o of rows) if (o.identity_id === r.identity_id || (r.duplicate_group_id && o.duplicate_group_id === r.duplicate_group_id)) expect(o.split_group_id).toBe(r.split_group_id);
    }
    expect(new Set(rows.map((r) => r.split_group_id)).size).toBe(gt.counts.split_groups);
  });
});

describe("decoys have the property their type names", () => {
  const decoys = rows.filter((r) => r.decoy_type !== null);
  it("has 40 decoys: 30 found, 10 missing, each aimed at a different child's record", () => {
    expect(decoys).toHaveLength(40);
    expect(decoys.filter((r) => r.kind === "found")).toHaveLength(30);
    for (const d of decoys) {
      expect(d.true_partner_ids).toEqual([]);
      expect(d.decoy_target_ids).toHaveLength(1);
      const t = byId.get(d.decoy_target_ids[0])!;
      expect(t.kind).not.toBe(d.kind);
      expect(t.identity_id).not.toBe(d.identity_id);
    }
    expect(new Set(decoys.map((d) => d.decoy_type))).toEqual(new Set(["wrong_district", "similar_name", "same_clothing_diff_age", "contradiction", "unknown_age", "overlapping_time", "shared_phone"]));
  });

  it.each([
    ["wrong_district", (d: Draft, t: Draft) => expect(near(d.event.district_code, t.event.district_code)).toBe(false)],
    ["similar_name", (d: Draft, t: Draft) => { if (d.child.name && t.child.name) expect(d.child.name).not.toBe(t.child.name); }],
    ["same_clothing_diff_age", (d: Draft, t: Draft) => {
      expect(Math.abs(mid(d.child) - mid(t.child))).toBeGreaterThanOrEqual(3);
    }],
    ["contradiction", (d: Draft, t: Draft) => expect(d.child.sex !== t.child.sex || d.child.marks !== t.child.marks).toBe(true)],
    ["unknown_age", (d: Draft) => { expect(d.child.age_min).toBeNull(); expect(d.child.age_max).toBeNull(); }],
    ["overlapping_time", (d: Draft, t: Draft) => expect(Math.abs(Date.parse(d.event.at) - Date.parse(t.event.at))).toBeLessThanOrEqual(3 * 3600e3)],
    ["shared_phone", (d: Draft, t: Draft) => expect(d.reporter.phone).toBe(t.reporter.phone)],
  ] as const)("%s", (type, check) => {
    const mine = decoys.filter((d) => d.decoy_type === type);
    expect(mine.length).toBeGreaterThan(0);
    for (const r of mine) check(recById.get(r.record_id)!.draft, recById.get(r.decoy_target_ids[0])!.draft);
  });

  it("similar_name found decoys carry a name; only same-sex confusables are used", () => {
    for (const r of decoys.filter((d) => d.decoy_type === "similar_name" && d.kind === "found")) {
      const d = recById.get(r.record_id)!.draft, t = recById.get(r.decoy_target_ids[0])!.draft;
      expect(d.child.name).not.toBeNull();
      expect(d.child.sex).toBe(t.child.sex);
    }
  });
});

describe("no shortcuts (RISK-007)", () => {
  it("records.jsonl carries no label or role, and record order does not place true pairs side by side", () => {
    expect(Object.keys(records[0]).sort()).toEqual(["draft", "is_synthetic", "kind", "record_id"]);
    const adjacent = rows.filter((r, i) => i > 0 && r.true_partner_ids.includes(rows[i - 1].record_id)).length;
    expect(adjacent).toBeLessThan(10);
  });

  it("phone does not separate the classes: true pairs and unrelated records both share contacts", () => {
    const sharedPairs = rows.filter((r) => r.role === "pair_found" && r.true_partner_ids.some((p) => recById.get(p)!.draft.reporter.phone === recById.get(r.record_id)!.draft.reporter.phone));
    expect(sharedPairs.length).toBeGreaterThanOrEqual(5);
    const foundFound = rows.filter((r) => r.kind === "found" && r.decoy_type === null && r.phone_shared_with_other_identities.some((id) => byId.get(id)!.kind === "found"));
    expect(foundFound.length).toBeGreaterThanOrEqual(5);
    const missingMissing = rows.filter((r) => r.kind === "missing" && r.decoy_type === null && r.phone_shared_with_other_identities.some((id) => byId.get(id)!.kind === "missing"));
    expect(missingMissing.length).toBeGreaterThanOrEqual(4);
    for (const r of rows) {
      const phone = recById.get(r.record_id)!.draft.reporter.phone;
      for (const id of r.phone_shared_with_other_identities) expect(recById.get(id)!.draft.reporter.phone).toBe(phone);
    }
  });

  it("every role draws text variants from the same families", () => {
    const variants = (f: (r: Row) => boolean) => new Set(rows.filter(f).map((r) => r.source_variant));
    const foundVariants = (role: string) => variants((r) => r.kind === "found" && (role === "decoy" ? r.decoy_type !== null : r.role === role));
    expect(foundVariants("pair_found")).toContain("short");
    expect(foundVariants("dup_found").size).toBeGreaterThanOrEqual(2);
    expect(foundVariants("decoy").size).toBeGreaterThanOrEqual(2);
    expect(variants((r) => r.role === "pair_query")).toContain("public_post");
  });

  it("duplicates do not all repeat the place string or the phone", () => {
    const groups = new Map<string, Rec[]>();
    for (const r of rows) if (r.duplicate_group_id) groups.set(r.duplicate_group_id, [...(groups.get(r.duplicate_group_id) ?? []), recById.get(r.record_id)!]);
    const samePlace = [...groups.values()].filter(([a, b]) => a.draft.event.place_text === b.draft.event.place_text).length;
    expect(samePlace).toBeLessThan(25);
    expect(samePlace).toBeGreaterThan(0);
    const missingGroups = [...groups.values()].filter(([a]) => a.kind === "missing");
    expect(missingGroups.some(([a, b]) => a.draft.reporter.phone !== b.draft.reporter.phone)).toBe(true);
  });
});

describe("demo cases and plausibility", () => {
  it("carries the D6 §9.2 demo cases, with event times before 15 Oct 2026", () => {
    const demo = Object.fromEntries(rows.filter((r) => r.demo_role).map((r) => [r.demo_role, r]));
    for (const k of ["rafi", "kamalapur_boy", "narayanganj_decoy", "mim", "mim_public_post", "sabbir"]) expect(demo[k], k).toBeDefined();
    expect(demo.rafi.true_partner_ids).toContain(demo.kamalapur_boy.record_id);
    expect(demo.narayanganj_decoy.decoy_target_ids).toEqual([demo.rafi.record_id]);
    expect(demo.mim.duplicate_group_id).toBe(demo.mim_public_post.duplicate_group_id);
    expect(demo.sabbir.no_match).toBe(true);
    const latest = Math.max(...records.map((r) => Date.parse(r.draft.event.at)));
    expect(latest).toBeLessThan(Date.parse("2026-10-15T00:00:00+06:00"));
  });

  it("a true pair shares sex, and the found age range covers the missing age", () => {
    for (const r of rows.filter((x) => x.role === "pair_query")) {
      const m = recById.get(r.record_id)!.draft;
      for (const pid of r.true_partner_ids) {
        const f = recById.get(pid)!.draft;
        expect(f.child.sex).toBe(m.child.sex);
        if (f.child.age_min !== null) {
          expect(f.child.age_min).toBeLessThanOrEqual(m.child.age_years!);
          expect(f.child.age_max).toBeGreaterThanOrEqual(m.child.age_years!);
        }
      }
    }
  });

  it("text is NFC and uses Bangla digits in Bangla templates", () => {
    for (const r of records) expect(r.draft.source_text).toBe(r.draft.source_text.normalize("NFC"));
    expect(records.some((r) => /[০-৯]{11}/.test(r.draft.source_text))).toBe(true);
  });
});
