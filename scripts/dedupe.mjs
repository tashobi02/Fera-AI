#!/usr/bin/env node
// npm run dedupe -- --case <uuid> | --all (TASK-018, COMP-013). Local database only (same loopback
// guard as reembed / db:reset); owner connection like the other local tooling (so it is NOT a
// grant proof: the fera_app DB test is). Writes `duplicate_links` rows with status 'flagged' and
// nothing else. Prints counts and the database name only: no child text, names, phones or
// reference codes.
//
// --all also prints a SMOKE on all 200 synthetic records versus the 25 declared duplicate
// links (data/synthetic/ground_truth.json, joined by cases.client_submission_id = record_id). It
// is NOT a dev/test split result and NOT a result: the thresholds are UNCALIBRATED (A-014, A-029).
// `predicted` reads the WHOLE duplicate_links table, so the smoke is valid only on a fresh database
// (db:reset, seed, reembed, dedupe); stale or hand-made links would be counted as predictions.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { DEFAULT_DATABASE_URL, assertDatabaseName, assertLocalDatabaseUrl, withDatabase } from "./db/guard.mjs";
import { requireTypeStripping } from "./embeddings/preflight.mjs";

requireTypeStripping("dedupe");
const { PROFILE_COLUMNS, assessPair, detectDuplicates, toProfile } = await import("../src/server/duplicates/detect.ts");
const require = createRequire(import.meta.url);
const { Client } = require("pg");

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const key = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

function parseArgs(argv) {
  const args = argv.filter((a) => a !== "--");
  if (args.length === 1 && args[0] === "--all") return { all: true };
  if (args.length === 2 && args[0] === "--case" && UUID.test(args[1])) return { caseId: args[1].toLowerCase() };
  throw new Error("Usage: npm run dedupe -- --case <uuid> | --all");
}

async function smoke(client) {
  const truth = JSON.parse(readFileSync(new URL("../data/synthetic/ground_truth.json", import.meta.url), "utf8")).records;
  const { rows } = await client.query("SELECT id, client_submission_id AS rid, kind, contact_phone AS phone FROM cases");
  const byRecord = new Map(rows.map((r) => [r.rid, r]));
  const idOf = new Map(); // case id -> identity
  const caseOf = new Map(); // record id -> case id
  for (const t of truth) {
    const c = byRecord.get(t.record_id);
    if (c) { idOf.set(c.id, t.identity_id); caseOf.set(t.record_id, c.id); }
  }
  if (caseOf.size !== 200) return { skipped: `smoke needs the full 200-record seed (found ${caseOf.size} joined)` };

  const groups = new Map();
  for (const t of truth) {
    if (!t.duplicate_group_id) continue;
    if (!groups.has(t.duplicate_group_id)) groups.set(t.duplicate_group_id, []);
    groups.get(t.duplicate_group_id).push(caseOf.get(t.record_id));
  }
  // every pair inside each declared group (groups of 2 give 1 pair; a larger group gives n choose 2)
  const declared = new Set();
  for (const members of groups.values()) for (let i = 0; i < members.length; i++) for (let j = i + 1; j < members.length; j++) declared.add(key(members[i], members[j]));
  const predicted = new Set((await client.query("SELECT case_a, case_b FROM duplicate_links")).rows.map((r) => key(r.case_a, r.case_b)));
  let tp = 0;
  for (const p of predicted) if (declared.has(p)) tp++;
  const fp = predicted.size - tp;
  const fn = declared.size - tp;
  const precision = predicted.size ? tp / predicted.size : null;
  const recall = declared.size ? tp / declared.size : null;
  const f1 = precision !== null && recall !== null && precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : null;

  // Different-child shared-phone pairs: same kind, same phone, different identity.
  const sharedPhonePairs = [];
  for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
    const a = rows[i], b = rows[j];
    if (a.kind === b.kind && a.phone && a.phone === b.phone && idOf.get(a.id) !== idOf.get(b.id)) sharedPhonePairs.push(key(a.id, b.id));
  }
  const wrongSharedPhone = sharedPhonePairs.filter((p) => predicted.has(p)).length;
  // how many of those pairs survive the hard filters (live, sex, age +-1, time 72 h): the real at-risk set
  const profiles = new Map((await client.query(`SELECT ${PROFILE_COLUMNS} FROM cases c`)).rows.map((r) => [r.id, toProfile(r)]));
  const survivors = sharedPhonePairs.filter((p) => { const [x, y] = p.split("|"); return assessPair(profiles.get(x), profiles.get(y), null).rejected === null; }).length;
  const decoyTargetPairs = [];
  for (const t of truth.filter((r) => r.decoy_type === "shared_phone")) {
    for (const target of t.decoy_target_ids) {
      const a = byRecord.get(t.record_id), b = byRecord.get(target);
      if (a && b && a.kind === b.kind) decoyTargetPairs.push(key(a.id, b.id));
    }
  }
  const phoneOnly = (await client.query("SELECT count(*)::int AS n FROM duplicate_links WHERE rule = 'same_phone'")).rows[0].n;
  return {
    label: "smoke on all 200 synthetic records, NOT dev/test, NOT a result; thresholds UNCALIBRATED",
    declared_links: declared.size, predicted_links: predicted.size, tp, fp, fn,
    precision, recall, f1,
    different_child_links: fp,
    shared_phone_different_child_pairs_same_kind: sharedPhonePairs.length,
    shared_phone_pairs_surviving_hard_filters: survivors,
    shared_phone_different_child_pairs_wrongly_linked: wrongSharedPhone,
    declared_shared_phone_decoy_same_kind_pairs: decoyTargetPairs.length,
    declared_shared_phone_decoy_pairs_wrongly_linked: decoyTargetPairs.filter((p) => predicted.has(p)).length,
    phone_only_links: phoneOnly,
  };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const server = assertLocalDatabaseUrl(process.env.FERA_DB_ADMIN_URL ?? DEFAULT_DATABASE_URL, "dedupe");
  const target = withDatabase(server, assertDatabaseName(process.env.FERA_DB_NAME ?? "fera"));
  const client = new Client({ connectionString: target.href, connectionTimeoutMillis: 10_000 });
  await client.connect();
  try {
    const ids = opts.all ? (await client.query("SELECT id FROM cases ORDER BY id")).rows.map((r) => r.id) : [opts.caseId];
    let checked = 0, created = 0, existing = 0;
    for (const id of ids) {
      const links = await detectDuplicates(client, id);
      checked++;
      for (const l of links) {
        if (l.created) created++;
        else existing++;
      }
    }
    console.log(JSON.stringify({ database: target.pathname.slice(1), cases_checked: checked, links_created: created, links_already_present: existing }));
    if (opts.all) console.log(JSON.stringify(await smoke(client)));
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(`dedupe: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
