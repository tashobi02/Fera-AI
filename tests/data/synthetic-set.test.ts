// TASK-010: the synthetic set matches A-039 and is internally consistent (BR-026).
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { foundSubmissionDraftSchema, missingSubmissionDraftSchema } from "../../src/contracts/draft";
// @ts-expect-error -- plain ESM module without type declarations
import { loadDistrictData } from "../../db/seed/districts.mjs";
// @ts-expect-error -- plain ESM module without type declarations
import { generate, outputs } from "../../db/seed/synthetic.mjs";

const dir = join(process.cwd(), "data", "synthetic");
const read = (n: string) => readFileSync(join(dir, n), "utf8");
const records = read("records.jsonl").trim().split("\n").map((l) => JSON.parse(l));
const gt = JSON.parse(read("ground_truth.json"));
type Row = (typeof gt.records)[number];
const rows: Row[] = gt.records;
const byId = new Map<string, Row>(rows.map((r) => [r.record_id, r]));

describe("synthetic set (A-039)", () => {
  it("has the declared composition", () => {
    expect(gt.counts).toEqual({
      total: 200, missing_canonical: 80, found_canonical: 80, decoys: 40, true_pairs: 60,
      no_match_queries: 20, duplicate_links: 25, shared_phone_decoys: 7,
    });
    expect(records).toHaveLength(200);
    expect(rows).toHaveLength(200);
  });

  it("is committed byte-for-byte as the generator produces it, and hashed", () => {
    const files = outputs(loadDistrictData());
    for (const [name, content] of Object.entries(files)) expect(read(name)).toBe(content);
    expect(read("ground_truth.sha256").split(" ")[0]).toBe(createHash("sha256").update(read("ground_truth.json")).digest("hex"));
    expect(read("records.sha256").split(" ")[0]).toBe(createHash("sha256").update(read("records.jsonl")).digest("hex"));
    expect(generate(loadDistrictData()).recordsJsonl).toBe(files["records.jsonl"]);
  });

  it("labels every record synthetic and gives unique ids and phones where required", () => {
    expect(records.every((r) => r.is_synthetic === true)).toBe(true);
    expect(new Set(records.map((r) => r.record_id)).size).toBe(200);
    expect(new Set(records.map((r) => r.label)).size).toBe(200);
    expect(records.map((r) => r.record_id)).toEqual(rows.map((r) => r.record_id));
  });

  it("every draft parses with its submission schema (so the seed loader can submit it)", () => {
    for (const r of records) {
      const schema = r.kind === "missing" ? missingSubmissionDraftSchema : foundSubmissionDraftSchema;
      const parsed = schema.safeParse(r.draft);
      expect(parsed.success, `${r.label}: ${parsed.success ? "" : JSON.stringify(parsed.error.issues)}`).toBe(true);
    }
  });

  it("uses only the reserved synthetic phone block and no photo/coordinate field", () => {
    for (const r of records) {
      expect(r.draft.reporter.phone).toMatch(/^0170000\d{4}$/);
      expect(JSON.stringify(r)).not.toMatch(/"(photo|image|lat|lng|latitude|longitude|coordinates)"\s*:/i);
    }
  });

  it("true pairs and partners are symmetric, same identity, opposite kinds", () => {
    const pairs = new Set(rows.filter((r) => r.role === "pair_query").map((r) => r.identity_id));
    expect(pairs.size).toBe(60);
    for (const r of rows) {
      for (const pid of r.true_partner_ids) {
        const p = byId.get(pid)!;
        expect(p.kind).not.toBe(r.kind);
        expect(p.identity_id).toBe(r.identity_id);
        expect(p.true_partner_ids).toContain(r.record_id);
      }
      if (r.role === "pair_query") expect(r.true_partner_ids.length).toBeGreaterThanOrEqual(1);
      if (r.no_match) expect(r.true_partner_ids).toEqual([]);
    }
  });

  it("no-match queries have no found record of the same identity; 15 identities, 5 with a duplicate", () => {
    const nm = rows.filter((r) => r.kind === "missing" && r.no_match);
    expect(nm).toHaveLength(20);
    expect(new Set(nm.map((r) => r.identity_id)).size).toBe(15);
    for (const r of nm) expect(rows.some((o) => o.kind === "found" && o.identity_id === r.identity_id)).toBe(false);
  });

  it("duplicate groups are two same-identity, same-kind records", () => {
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

  it("decoys are different children that point at the record they imitate", () => {
    const decoys = rows.filter((r) => r.decoy_type !== null);
    expect(decoys).toHaveLength(40);
    expect(decoys.filter((r) => r.kind === "found")).toHaveLength(30);
    expect(decoys.filter((r) => r.kind === "missing")).toHaveLength(10);
    for (const d of decoys) {
      expect(d.true_partner_ids).toEqual([]);
      expect(d.decoy_target_ids).toHaveLength(1);
      const t = byId.get(d.decoy_target_ids[0])!;
      expect(t.kind).not.toBe(d.kind);
      expect(t.identity_id).not.toBe(d.identity_id);
    }
    const types = new Set(decoys.map((d) => d.decoy_type));
    for (const need of ["wrong_district", "similar_name", "same_clothing_diff_age", "contradiction", "unknown_age", "overlapping_time", "shared_phone"]) expect(types).toContain(need);
  });

  it("shared-phone decoys really share a phone with a different child", () => {
    const phone = (id: string) => records.find((r) => r.record_id === id)!.draft.reporter.phone;
    for (const d of rows.filter((r) => r.decoy_type === "shared_phone")) {
      expect(phone(d.record_id)).toBe(phone(d.decoy_target_ids[0]));
    }
  });

  it("carries the D6 §9.2 demo cases, with no future event times", () => {
    const demo = Object.fromEntries(rows.filter((r) => r.demo_role).map((r) => [r.demo_role, r]));
    for (const k of ["rafi", "kamalapur_boy", "narayanganj_decoy", "mim", "mim_public_post", "sabbir"]) expect(demo[k], k).toBeDefined();
    expect(demo.rafi.true_partner_ids).toContain(demo.kamalapur_boy.record_id);
    expect(demo.narayanganj_decoy.decoy_target_ids).toEqual([demo.rafi.record_id]);
    expect(demo.mim.duplicate_group_id).toBe(demo.mim_public_post.duplicate_group_id);
    expect(demo.sabbir.no_match).toBe(true);
    const latest = Math.max(...records.map((r) => Date.parse(r.draft.event.at_upper)));
    expect(latest).toBeLessThan(Date.parse("2026-10-15T00:00:00+06:00"));
  });

  it("keeps pairs findable: a true pair shares sex, and the found age range covers the missing age", () => {
    for (const r of rows.filter((x) => x.role === "pair_query")) {
      const m = records.find((x) => x.record_id === r.record_id)!.draft;
      for (const pid of r.true_partner_ids) {
        const f = records.find((x) => x.record_id === pid)!.draft;
        expect(f.child.sex).toBe(m.child.sex);
        if (f.child.age_min !== null) {
          expect(f.child.age_min).toBeLessThanOrEqual(m.child.age_years);
          expect(f.child.age_max).toBeGreaterThanOrEqual(m.child.age_years);
        }
      }
    }
  });
});
