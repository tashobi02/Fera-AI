// TASK-018 duplicate detector against a real PostgreSQL 16 with the 200 seeded synthetic cases.
// Embeddings come from the deterministic FAKE embedder (hash-seeded; no model in CI), so the
// cosine cue only fires for identical text here. The real-model run is in the evidence doc.
// Pair-level precision/recall are NOT asserted: thresholds are UNCALIBRATED (A-014/A-029).
import { readFileSync } from "node:fs";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { detectDuplicates, duplicateBannerFor, listLinksFor } from "../../src/server/duplicates";
import { setEmbedder } from "../../src/server/embeddings";
// @ts-expect-error -- plain ESM module without type declarations
import { seedCases } from "../../db/seed/cases.mjs";
// @ts-expect-error -- plain ESM module without type declarations
import { loadDistrictData, seedDistricts } from "../../db/seed/districts.mjs";
// @ts-expect-error -- plain ESM module without type declarations
import { reembedCases } from "../../scripts/embeddings/reembed-lib.mjs";
import { fakeEmbedder } from "../embeddings/support";
import { connect, dbTestsEnabled } from "./support/db";

type Truth = { record_id: string; label: string; kind: string; demo_role: string | null; decoy_type: string | null; decoy_target_ids: string[]; duplicate_group_id: string | null };
const truth = (JSON.parse(readFileSync("data/synthetic/ground_truth.json", "utf8")).records as Truth[]);

describe.skipIf(!dbTestsEnabled)("duplicate detector (TASK-018, TC-013, TC-038)", () => {
  let admin: Client;
  let app: Client;
  const caseOf = new Map<string, { id: string; ref: string }>();
  const snapshot = async () => (await admin.query("SELECT id, status, version, updated_at, anonymised_at FROM cases ORDER BY id")).rows;
  const runAll = async () => {
    let created = 0;
    let total = 0;
    for (const { id } of caseOf.values()) {
      const links = await detectDuplicates(app, id);
      total += links.length;
      created += links.filter((l) => l.created).length;
    }
    return { created, total };
  };

  beforeAll(async () => {
    admin = await connect("admin");
    app = await connect("app");
    await seedDistricts(admin, loadDistrictData());
    await admin.query(
      `INSERT INTO users (username, display_name, password_hash, role) VALUES
         ('staff.demo', '[MOCK] স্টাফ এক', 'x', 'staff'), ('staff2.demo', '[MOCK] স্টাফ দুই', 'x', 'staff')`,
    );
    await seedCases(admin, { set: "full" });
    setEmbedder(fakeEmbedder());
    await reembedCases(admin);
    const { rows } = await admin.query("SELECT id, ref_code, client_submission_id AS rid FROM cases");
    for (const r of rows) caseOf.set(r.rid, { id: r.id, ref: r.ref_code });
  });
  afterAll(async () => {
    setEmbedder(null);
    await app?.end();
    await admin?.end();
  });

  it("detection leaves every original case untouched, and a rerun creates no extra link", async () => {
    const auditBefore = (await admin.query("SELECT count(*)::int AS n FROM audit_log")).rows[0].n;
    const before = await snapshot();
    const first = await runAll();
    const links = (await admin.query("SELECT count(*)::int AS n FROM duplicate_links")).rows[0].n;
    expect(first.created).toBe(links);
    expect(links).toBeGreaterThan(0);
    const second = await runAll();
    expect(second.created).toBe(0);
    expect((await admin.query("SELECT count(*)::int AS n FROM duplicate_links")).rows[0].n).toBe(links);
    // nothing hidden, merged, redacted or status-changed on either report
    expect(await snapshot()).toEqual(before);
    // no audit action exists for this yet (open decision), so detection writes none
    expect((await admin.query("SELECT count(*)::int AS n FROM audit_log")).rows[0].n).toBe(auditBefore);
  });

  it("only writes flagged profile links between same-kind reports, in schema order, never same_phone", async () => {
    const { rows } = await admin.query(
      `SELECT l.rule, l.status, l.resolved_by, l.resolved_at, l.case_a < l.case_b AS ordered, a.kind = b.kind AS same_kind, l.score::float8 AS score
         FROM duplicate_links l JOIN cases a ON a.id = l.case_a JOIN cases b ON b.id = l.case_b`,
    );
    for (const r of rows) {
      expect(r).toMatchObject({ rule: "profile", status: "flagged", resolved_by: null, resolved_at: null, ordered: true, same_kind: true });
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(100);
    }
  });

  it("the declared shared-phone decoy pairs stay unlinked and both reports stay visible (TC-038)", async () => {
    const decoys = truth.filter((t) => t.decoy_type === "shared_phone");
    expect(decoys).toHaveLength(7);
    let sameKindPairs = 0;
    for (const d of decoys) {
      for (const target of d.decoy_target_ids) {
        const a = caseOf.get(d.record_id)!;
        const b = caseOf.get(target)!;
        const [lo, hi] = a.id < b.id ? [a.id, b.id] : [b.id, a.id];
        const linked = await admin.query("SELECT 1 FROM duplicate_links WHERE case_a = $1 AND case_b = $2", [lo, hi]);
        expect(linked.rowCount).toBe(0);
        const visible = await admin.query("SELECT count(*)::int AS n FROM cases WHERE id = ANY($1::uuid[]) AND anonymised_at IS NULL AND status IN ('open','submitted')", [[a.id, b.id]]);
        expect(visible.rows[0].n).toBe(2);
        const kinds = await admin.query("SELECT count(DISTINCT kind)::int AS n FROM cases WHERE id = ANY($1::uuid[])", [[a.id, b.id]]);
        if (kinds.rows[0].n === 1) sameKindPairs++;
      }
    }
    // Real count: every decoy target is the other kind, so a same-kind detector cannot link these
    // pairs by construction. This test proves they stay unlinked and visible, not that the shared
    // phone was resisted; the phone-resistance proof is the pure tests in tests/duplicates.
    expect(sameKindPairs).toBe(0);
  });

  it("no pair is linked on a shared phone alone: every link has non-phone evidence", async () => {
    for (const { id } of caseOf.values()) {
      for (const l of await detectDuplicates(app, id)) {
        const nonPhone = l.evidence.filter((e) => ["name", "clothing", "marks", "place_text"].includes(e.cue));
        expect(nonPhone.length).toBeGreaterThanOrEqual(2);
        expect(l.rule).toBe("profile");
      }
    }
  });

  // Depends on DUPLICATE_PARAMS: the two reports agree on name, clothing, marks and place, ages and
  // times are inside the windows. If the params change so that this stops linking, update this test
  // on purpose (a regression for the TC-013 demo pair), do not loosen it silently.
  it("Mim and her public-post duplicate are linked, with banner data on both sides", async () => {
    const mim = truth.find((t) => t.demo_role === "mim")!;
    const post = truth.find((t) => t.demo_role === "mim_public_post")!;
    const a = caseOf.get(mim.record_id)!;
    const b = caseOf.get(post.record_id)!;
    const links = await listLinksFor(app, a.id);
    expect(links.map((l) => [l.caseA, l.caseB].sort().join())).toContain([a.id, b.id].sort().join());
    const banner = duplicateBannerFor(links, a.id, "bn").find((x) => x.otherCaseId === b.id)!;
    expect(banner.text).toBe(`সম্ভাব্য একই শিশু: ${b.ref}`);
    expect(duplicateBannerFor(await listLinksFor(app, b.id), b.id, "en").find((x) => x.otherCaseId === a.id)!.text).toBe(`Possible same child: ${a.ref}`);
    // both reports remain independently discoverable
    const { rows } = await admin.query("SELECT status FROM cases WHERE id = ANY($1::uuid[])", [[a.id, b.id]]);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.status === "open")).toBe(true);
  });

  it("never links across kinds (missing vs found)", async () => {
    const { rows } = await admin.query("SELECT count(*)::int AS n FROM duplicate_links l JOIN cases a ON a.id = l.case_a JOIN cases b ON b.id = l.case_b WHERE a.kind <> b.kind");
    expect(rows[0].n).toBe(0);
    // an identical-profile pair of the OTHER kind is never returned for a missing anchor
    const mim = caseOf.get(truth.find((t) => t.demo_role === "mim")!.record_id)!;
    for (const l of await detectDuplicates(app, mim.id)) {
      const kinds = await admin.query("SELECT DISTINCT kind FROM cases WHERE id = ANY($1::uuid[])", [[l.caseA, l.caseB]]);
      expect(kinds.rows).toHaveLength(1);
    }
  });

  async function linkedMissingPairs() {
    const { rows } = await admin.query(
      `SELECT l.case_a, l.case_b FROM duplicate_links l JOIN cases a ON a.id = l.case_a
        WHERE a.kind = 'missing' AND a.status = 'open' ORDER BY l.case_a`);
    const mimIds = new Set(truth.filter((t) => t.demo_role === "mim" || t.demo_role === "mim_public_post").map((t) => caseOf.get(t.record_id)!.id));
    return rows.filter((r) => !mimIds.has(r.case_a) && !mimIds.has(r.case_b)) as { case_a: string; case_b: string }[];
  }

  it("a terminal-status report gets no new link and is not returned as a candidate", async () => {
    const [pair] = await linkedMissingPairs();
    expect(pair).toBeDefined();
    await admin.query("UPDATE cases SET status = 'closed', closed_at = now(), outcome = 'resolved_outside_fera' WHERE id = $1", [pair.case_a]);
    await admin.query("DELETE FROM duplicate_links WHERE case_a = $1 AND case_b = $2", [pair.case_a, pair.case_b]);
    expect((await detectDuplicates(app, pair.case_b)).map((l) => [l.caseA, l.caseB])).not.toContainEqual([pair.case_a, pair.case_b]);
    expect(await detectDuplicates(app, pair.case_a)).toEqual([]);
    expect((await admin.query("SELECT count(*)::int AS n FROM duplicate_links WHERE case_a = $1 AND case_b = $2", [pair.case_a, pair.case_b])).rows[0].n).toBe(0);
  });

  it("a redacted report gets no link, and listLinksFor hides an existing link to it", async () => {
    const [pair] = await linkedMissingPairs();
    expect(pair).toBeDefined();
    const adminUser = (await admin.query(`INSERT INTO users (username, display_name, password_hash, role) VALUES ('admin.dup', '[MOCK] অ্যাডমিন', 'x', 'admin') RETURNING id`)).rows[0].id;
    expect((await listLinksFor(app, pair.case_b)).some((l) => l.caseA === pair.case_a || l.caseB === pair.case_a)).toBe(true);
    await admin.query("UPDATE cases SET status = 'closed', closed_at = now(), outcome = 'resolved_outside_fera' WHERE id = $1", [pair.case_a]);
    await admin.query("SELECT redact_case($1, $2)", [pair.case_a, adminUser]);
    // the stored link row survives (payload-free) but is not exposed
    expect((await admin.query("SELECT count(*)::int AS n FROM duplicate_links WHERE case_a = $1 AND case_b = $2", [pair.case_a, pair.case_b])).rows[0].n).toBe(1);
    expect((await listLinksFor(app, pair.case_b)).some((l) => l.caseA === pair.case_a || l.caseB === pair.case_a)).toBe(false);
    expect(await listLinksFor(app, pair.case_a)).toEqual([]);
    expect(await detectDuplicates(app, pair.case_a)).toEqual([]);
    expect((await detectDuplicates(app, pair.case_b)).some((l) => l.caseA === pair.case_a || l.caseB === pair.case_a)).toBe(false);
  });

  it("a redacted or unknown case yields no link and no error", async () => {
    expect(await detectDuplicates(app, "00000000-0000-4000-8000-00000000dead")).toEqual([]);
  });
});
