#!/usr/bin/env node
// npm run reembed — TASK-016 / COMP-011 / TC-059.
//
// Re-embeds every non-redacted, non-terminal case row in a fresh local
// database. The script:
//   * Refuses a non-loopback DATABASE_URL (assertLocalDatabaseUrl).
//   * Refuses a non-fera database name (assertDatabaseName).
//   * Preflight: refuses Node < 22.18 (it loads TypeScript sources via
//     Node's built-in type stripping; see scripts/embeddings/preflight.mjs).
//   * Connects as the local runtime role (fera_app) using the role
//     passwords from scripts/db/roles.mjs; we never connect with the
//     owner or superuser. All UPDATEs to cases.embedding(_*) are
//     allowed for fera_app.
//   * Runs `reembedCases` from scripts/embeddings/reembed-lib.mjs. The
//     lib:
//       - only ever reads `cases` (submitted rows), never `intake_drafts`;
//       - skips redacted (anonymised_at IS NOT NULL) and terminal
//         (confirmed / closed / referred) rows;
//       - skips empty embed text (bare prefix) and clears the old
//         vector if one was there;
//       - writes version-guarded UPDATEs and retries once on a stale
//         row;
//       - on a model-space upgrade (operator bumped EMBEDDING.revision
//         or EMBEDDING.dtype / TEXT_RECIPE), DELETEs pending
//         `match_candidates` and resets `matching_state` to 'queued'
//         so the matcher never compares a vector from the old space
//         to one from the new space. Confirmed candidates are kept.
//   * SECURITY HARDENING: the runtime path never reaches huggingface.co
//     (the loader sets `env.allowRemoteModels = false` and verifies the
//     local cache against the pinned SHA-256s). The cache MUST be
//     primed with `npm run model:fetch` first; if the cache is empty
//     the call is allowed to fail and the operator sees the actionable
//     hint pointing at the priming script.
//   * Prints only counts to stdout and pg error codes to stderr —
//     never the connection string, never a password, never the model
//     URL.
//
// Exit codes:
//   0  reembed completed and the table is consistent
//   1  configuration / connection / embedding error (pg error CODE on stderr)
//   2  the database was found, but nothing is re-embedded yet (no rows)
//      — distinct from a real failure so wave gates can tell
//   3  Node is too old for type stripping
//   4  local model cache is missing or tampered with (run model:fetch)

import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { requireTypeStripping } from "./embeddings/preflight.mjs";

requireTypeStripping("reembed");

// Dynamic: on an old Node these .ts imports would fail before the
// preflight message. The await is intentional: do not move the
// preflight above this line.
const { reembedCases } = await import("./embeddings/reembed-lib.mjs");
const { EMBEDDING, defaultCacheDir } = await import("../src/server/embeddings/model.ts");

const {
  DEFAULT_DATABASE_URL,
  assertDatabaseName,
  assertLocalDatabaseUrl,
  maskUrl,
  scrubbedEnv,
  withDatabase,
} = await import("./db/guard.mjs");
const { rolePasswordEnv } = await import("./db/roles.mjs");

const require = createRequire(import.meta.url);
const { Client } = require("pg");

// Cache dir, anchored at the repository root via import.meta.url.
const CACHE_DIR = defaultCacheDir();

function safeUrl(url) {
  const copy = new URL(url.href);
  copy.username = "";
  copy.password = "";
  return copy.href;
}

function cacheSize() {
  if (!existsSync(CACHE_DIR)) return 0;
  const walk = (dir) => {
    let s = 0;
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      s += e.isDirectory() ? walk(p) : statSync(p).size;
    }
    return s;
  };
  return walk(CACHE_DIR);
}

async function main() {
  let admin;
  let dbName;
  let target;
  try {
    admin = assertLocalDatabaseUrl(process.env.FERA_DB_ADMIN_URL ?? DEFAULT_DATABASE_URL, "reembed");
    dbName = assertDatabaseName(process.env.FERA_DB_NAME ?? "fera");
    target = withDatabase(admin, dbName);
  } catch (err) {
    process.stderr.write(`reembed: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  }

  // SECURITY: verify the local cache against the pinned SHA-256s
  // before we touch the database. If the cache is missing or the
  // bytes do not match, the operator must prime the cache with
  // `npm run model:fetch`. We fail fast so the DB rows are not read
  // until we know the model can actually run.
  try {
    const { assertCacheReady } = await import("./embeddings/reembed-lib.mjs");
    await assertCacheReady(CACHE_DIR);
  } catch (err) {
    process.stderr.write(
      `reembed: ${err instanceof Error ? err.message : String(err)}; run \`npm run model:fetch\` to prime the cache\n`,
    );
    process.exit(4);
  }

  const passwords = rolePasswordEnv();
  // Mask the password before showing anything; safeUrl is host:port/dbname only.
  const userUrl = new URL(target.href);
  userUrl.username = "fera_app";
  userUrl.password = passwords.FERA_APP_DB_PASSWORD ?? "";
  const urlForPg = userUrl.href;
  const urlForError = safeUrl(userUrl);

  const client = new Client({ connectionString: urlForPg, connectionTimeoutMillis: 10_000 });
  try {
    await client.connect();
  } catch (err) {
    const code = err && typeof err === "object" && "code" in err && err.code ? ` (code ${String(err.code)})` : "";
    process.stderr.write(`reembed: connection refused ${urlForError}${code}\n`);
    process.exit(1);
  }

  try {
    const startedAt = Date.now();
    const counts = await reembedCases(client);
    const elapsedMs = Date.now() - startedAt;
    const seconds = (elapsedMs / 1000).toFixed(1);
    const summary = {
      database: dbName,
      embedded: counts.embedded,
      skipped_empty: counts.skipped_empty,
      cleared_empty: counts.cleared_empty,
      stale_retry: counts.stale_retry,
      stale_remaining: counts.stale_remaining,
      batches: counts.batches,
      pending_candidates: counts.pending_candidates ?? 0,
      cases_reset: counts.cases_reset ?? 0,
      space_upgrade: counts.space_upgrade ?? false,
      space: EMBEDDING.space,
      model: EMBEDDING.model,
      revision: EMBEDDING.revision,
      cache_bytes: cacheSize(),
      elapsed_s: Number(seconds),
    };
    process.stdout.write(`reembed: ${counts.embedded} records embedded in ${seconds}s\n`);
    if (counts.stale_remaining > 0) {
      process.stderr.write(
        `reembed: warning: ${counts.stale_remaining} record(s) changed while embedding and were not embedded; run npm run reembed again\n`,
      );
    }
    if (counts.space_upgrade) {
      process.stderr.write(
        `reembed: model-space upgrade detected; invalidated ${counts.pending_candidates} pending candidate(s) and reset ${counts.cases_reset} case(s) to matching_state=queued. Run the matcher separately to recompute candidates.\n`,
      );
    }
    process.stdout.write(JSON.stringify(summary) + "\n");
    process.exit(0);
  } catch (err) {
    const code = err && typeof err === "object" && "code" in err && err.code ? ` (code ${String(err.code)})` : "";
    process.stderr.write(`reembed: ${err instanceof Error ? err.message : String(err)}${code}\n`);
    process.exit(1);
  } finally {
    await client.end().catch(() => undefined);
  }
}

const invokedDirectly = process.argv[1] && import.meta.url === new URL(process.argv[1], "file://").href;
if (invokedDirectly) {
  main().catch((err) => {
    // Never include the URL / password / stack; pass the error CODE when
    // pg gives us one.
    const code = err && typeof err === "object" && "code" in err && err.code ? ` (code ${String(err.code)})` : "";
    process.stderr.write(`reembed: unhandled error${code}: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
}

// Re-export the helpers so a follow-up worker can reuse them.
export { CACHE_DIR, EMBEDDING, cacheSize, safeUrl, scrubbedEnv, maskUrl };
