// Synthetic PostgreSQL regressions for the awaited post-commit duplicate hook.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client, Pool } from "pg";
import { createFakeEmbedder, EMBEDDING_DIM, type Embedder } from "@/server/embeddings/model";
import { runMatcherForCase, runMatcherForFoundCase } from "@/server/matching/run";
import { connect, createActors, dbTestsEnabled, insertFound, insertMissing, one, openMissing, pool, seedReference, closedPair, type Actors } from "./support/db";

describe.skipIf(!dbTestsEnabled)("awaited duplicate hooks on PostgreSQL", () => {
  let owner: Client;
  let app: Pool;
  let actors: Actors;
  const embedder: Embedder = {
    ...createFakeEmbedder({ model: "multilingual-e5-small", space: "synthetic-space" }),
    revision: "synthetic-rev",
    async embed(texts) { return texts.map(() => { const v = new Float32Array(EMBEDDING_DIM); v[0] = 1; return v; }); },
  };
  beforeAll(async () => { owner = await connect("admin"); app = pool("app"); await seedReference(owner); actors = await createActors(owner); });
  afterAll(async () => { await Promise.all([owner?.end(), app?.end()]); });
  const vector = `[${[1, ...Array(383).fill(0)].join(",")}]`;
  async function setVector(id: string) {
    await app.query("UPDATE cases SET embedding=$1::vector, embedding_model='multilingual-e5-small', embedding_revision='synthetic-rev', embedding_space='synthetic-space' WHERE id=$2", [vector, id]);
  }
  async function linkCount(a: string, b: string) {
    const [lo, hi] = [a,b].sort();
    return one<{ count: number }>(app, "SELECT count(*)::int AS count FROM duplicate_links WHERE case_a=$1 AND case_b=$2", [lo,hi]);
  }
  it("persists an audited missing duplicate before returning and is idempotent", async () => {
    const a = await insertMissing(app); const b = await insertMissing(app);
    await openMissing(app,a.id); await openMissing(app,b.id); await setVector(a.id); await setVector(b.id);
    expect(await runMatcherForCase(a.id,{ embedder, pool:app, api:"API-014" })).toMatchObject({state:"complete"});
    expect(await linkCount(a.id,b.id)).toEqual({count:1});
    const audit = await one<{count:number}>(app,"SELECT count(*)::int AS count FROM audit_log WHERE action='duplicate.flagged'");
    expect(audit.count).toBeGreaterThan(0);
    expect(await runMatcherForCase(a.id,{ embedder, pool:app, api:"API-014" })).toMatchObject({state:"complete"});
    expect(await linkCount(a.id,b.id)).toEqual({count:1});
  });
  it("embeds a fresh found report and persists its same-kind duplicate", async () => {
    const a=await insertFound(app,actors.staff); const b=await insertFound(app,actors.staff);
    await setVector(b.id);
    expect(await runMatcherForFoundCase(a.id,{ embedder, pool:app })).toMatchObject({state:"complete"});
    expect(await linkCount(a.id,b.id)).toEqual({count:1});
    expect(await one<{present:boolean}>(app,"SELECT embedding IS NOT NULL AS present FROM cases WHERE id=$1",[a.id])).toEqual({present:true});
  });
  it("refuses a redacted found case without embedding or matching it", async () => {
    const { found: a } = await closedPair(app, actors);
    await owner.query("SELECT redact_case($1,$2)",[a.id, actors.admin]);
    expect(await runMatcherForFoundCase(a.id,{embedder,pool:app})).toMatchObject({state:"failed",errorId:"E-018"});
    expect(await one<{absent:boolean}>(app,"SELECT embedding IS NULL AS absent FROM cases WHERE id=$1",[a.id])).toEqual({absent:true});
  });
  it("returns a safe failure when duplicate persistence fails, retaining the committed case", async () => {
    const a=await insertMissing(app); const b=await insertMissing(app);
    await openMissing(app,a.id); await openMissing(app,b.id); await setVector(a.id); await setVector(b.id);
    await owner.query("CREATE FUNCTION synthetic_reject_duplicate() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic duplicate write failure'; END $$");
    await owner.query("CREATE TRIGGER synthetic_reject_duplicate BEFORE INSERT ON duplicate_links FOR EACH ROW EXECUTE FUNCTION synthetic_reject_duplicate()");
    try {
      expect(await runMatcherForCase(a.id,{embedder,pool:app,api:"API-014"})).toMatchObject({state:"failed",errorId:"E-021"});
      expect(await one<{status:string;matching_state:string}>(app,"SELECT status,matching_state FROM cases WHERE id=$1",[a.id])).toMatchObject({matching_state:"failed"});
      expect(await linkCount(a.id,b.id)).toEqual({count:0});
    } finally { await owner.query("DROP TRIGGER synthetic_reject_duplicate ON duplicate_links"); await owner.query("DROP FUNCTION synthetic_reject_duplicate()"); }
  });
});
