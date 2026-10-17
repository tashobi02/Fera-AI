#!/usr/bin/env node
// npm run reembed (TASK-016, COMP-011): fills cases.embedding for every non-redacted,
// non-terminal case whose embedding is NULL or was made with a different model, revision
// or space. Idempotent. Local database only (same loopback guard as db:reset / seed).
// Runs as the owner connection (like db:reset and seed), not fera_app: the loopback guard and
// owner URL are the existing local-tooling pattern. (fera_app can run the same logic; tested.)
// Prints counts only; never case text. Needs the model: run `npm run model:fetch` first.
import { createRequire } from "node:module";
import { performance } from "node:perf_hooks";
import { DEFAULT_DATABASE_URL, assertDatabaseName, assertLocalDatabaseUrl, withDatabase } from "./db/guard.mjs";
import { requireTypeStripping } from "./embeddings/preflight.mjs";

requireTypeStripping("reembed");
// Dynamic: on an old Node these .ts imports would fail before the preflight message.
const { reembedCases } = await import("./embeddings/reembed-lib.mjs");
const { EMBEDDING, getEmbedder } = await import("../src/server/embeddings/model.ts");

const require = createRequire(import.meta.url);
const { Client } = require("pg");

async function main() {
  if (process.argv.slice(2).some((a) => a !== "--")) throw new Error("Usage: npm run reembed");
  getEmbedder(); // fails closed now for EMBED_PROVIDER=api / unknown, before any DB work
  const server = assertLocalDatabaseUrl(process.env.FERA_DB_ADMIN_URL ?? DEFAULT_DATABASE_URL, "reembed");
  const target = withDatabase(server, assertDatabaseName(process.env.FERA_DB_NAME ?? "fera"));
  const client = new Client({ connectionString: target.href, connectionTimeoutMillis: 10_000 });
  await client.connect();
  const started = performance.now();
  try {
    const counts = await reembedCases(client);
    const seconds = ((performance.now() - started) / 1000).toFixed(1);
    console.log(`${counts.embedded} records embedded`);
    if (counts.stale_remaining > 0) console.warn(`warning: ${counts.stale_remaining} record(s) changed while embedding and were not embedded; run npm run reembed again`);
    console.log(JSON.stringify({ database: target.pathname.slice(1), ...counts, space: EMBEDDING.space, revision: EMBEDDING.revision, elapsed_s: Number(seconds) }));
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(`reembed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
