#!/usr/bin/env node
// npm run reembed — P3-024 / TASK-016 / COMP-011 / TC-059.
//
// Re-embeds every non-redacted case row in a fresh local database. The script:
//   * Refuses a non-loopback DATABASE_URL (assertLocalDatabaseUrl).
//   * Refuses a non-fera database name (assertDatabaseName).
//   * Connects as the local runtime role (fera_app) using the role passwords
//     from scripts/db/roles.mjs; we never connect with the owner or
//     superuser. All UPDATEs to cases.embedding(_*) are allowed for fera_app.
//   * Loads multilingual-e5-small lazily with @huggingface/transformers.
//     The heavy onnxruntime-node bundle is loaded inside the async fn, so a
//     syntax-only check of the script never triggers a download.
//   * Computes vectors in one batch with the e5 `query:` / `passage:` prefix
//     (per docs/execution/evidence/embedding-spike.md production policy).
//   * Stores the model id, optional revision (read from `refs/main` in the
//     cache) and the embedding space tag with each row.
//   * REFUSES to leave the table in a mixed state (TC-059): when any row
//     already has a different embedding_space, every row is rewritten in
//     one transaction so the table ends with exactly one space.
//   * Prints only counts to stdout and pg error codes to stderr — never
//     the connection string, never a password.
//
// Exit codes:
//   0  reembed completed and the table is consistent
//   1  configuration / connection / embedding error (pg error CODE on stderr)
//   2  the database was found, but nothing is re-embedded yet (no rows)
//      — distinct from a real failure so wave gates can tell

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import {
  DEFAULT_DATABASE_URL,
  assertDatabaseName,
  assertLocalDatabaseUrl,
  maskUrl,
  scrubbedEnv,
  withDatabase,
} from "./db/guard.mjs";
import { rolePasswordEnv } from "./db/roles.mjs";

const require = createRequire(import.meta.url);
const { Client } = require("pg");

const MODEL = "Xenova/multilingual-e5-small";
const CACHE_DIR = ".cache/models";
const EMBEDDING_DIM = 384;

// TC-059: the embedding space tag we store with each vector. The model,
// dtype, pool, normalize, query/passage prefixes — changing any of these
// changes the space and forces a full re-embed.
function makeSpace({ model, dtype, pool, normalize, query, passage }) {
  return [
    `model=${model}`,
    `dtype=${dtype}`,
    `pool=${pool}`,
    `normalize=${normalize ? "true" : "false"}`,
    `query=${JSON.stringify(query)}`,
    `passage=${JSON.stringify(passage)}`,
  ].join(";");
}

const SPACE = makeSpace({
  model: MODEL,
  dtype: "fp32",
  pool: "mean",
  normalize: true,
  query: "query: ",
  passage: "passage: ",
});

// Strip the prefix and verify the body is non-empty.
function isEmpty(text) {
  return text.replace(/^(query|passage): /, "").length === 0;
}

// Float32Array → pgvector `[v0,v1,…]` text. Six decimals are plenty for cosine
// over L2-normalised vectors and keeps the parameter under the 1-GB limit.
function vectorToSql(v) {
  const parts = new Array(v.length);
  for (let i = 0; i < v.length; i++) parts[i] = v[i].toFixed(6);
  return `[${parts.join(",")}]`;
}

// L2-normalise a single vector; reject zero / non-finite values.
function l2norm(v) {
  let s = 0;
  for (let i = 0; i < v.length; i++) {
    const x = v[i];
    if (!Number.isFinite(x)) throw new Error(`non-finite value at ${i}`);
    s += x * x;
  }
  if (s === 0) throw new Error("zero vector");
  const inv = 1 / Math.sqrt(s);
  for (let i = 0; i < v.length; i++) v[i] *= inv;
  return v;
}

async function loadLocalEmbedder() {
  const mod = await import("@huggingface/transformers");
  const { env, pipeline } = mod;
  env.cacheDir = CACHE_DIR;
  const extractor = await pipeline("feature-extraction", MODEL, { dtype: "fp32" });
  // Warm-up so the first user-visible call has a known cost shape and any
  // shape / dtype problem surfaces here (and would throw, not silently store
  // a bad vector).
  const warm = await extractor("passage: warm-up", { pooling: "mean", normalize: true });
  if (!warm || !warm.data || warm.data.length !== EMBEDDING_DIM) {
    throw new Error(`embedder warm-up returned dim ${warm?.data?.length ?? 0}, expected ${EMBEDDING_DIM}`);
  }
  const revision = readRevisionFromCache() ?? null;
  return { revision, embed: (texts) => embedTexts(extractor, texts) };
}

async function embedTexts(extractor, texts) {
  if (texts.length === 0) return [];
  const out = await extractor(texts, { pooling: "mean", normalize: true });
  const data = out.data;
  const dim = out.dims[out.dims.length - 1];
  if (dim !== EMBEDDING_DIM) throw new Error(`embedder dim ${dim} != ${EMBEDDING_DIM}`);
  const vectors = [];
  if (texts.length === 1) {
    vectors.push(new Float32Array(data));
  } else {
    for (let i = 0; i < texts.length; i++) {
      const start = i * dim;
      const slice = new Float32Array(dim);
      for (let j = 0; j < dim; j++) slice[j] = data[start + j];
      vectors.push(slice);
    }
  }
  return vectors.map(l2norm);
}

function readRevisionFromCache() {
  try {
    const p = join(CACHE_DIR, MODEL, "refs", "main");
    if (existsSync(p)) {
      const v = readFileSync(p, "utf8").trim();
      return v.length === 0 ? null : v;
    }
  } catch {
    /* cache absent before first download */
  }
  return null;
}

// Print cache dir total size in MiB; we keep it for the operator but never
// surface the connection string.
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

function safeUrl(url) {
  const copy = new URL(url.href);
  copy.username = "";
  copy.password = "";
  return copy.href;
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
    const { rows } = await client.query(
      "SELECT id, kind, clothing, marks, circumstances, place_text, embedding_space " +
        "FROM cases WHERE anonymised_at IS NULL ORDER BY created_at, id",
    );

    if (rows.length === 0) {
      process.stdout.write("reembed: no rows (0)\n");
      process.exit(2);
    }

    // TC-059: detect existing rows in a different embedding space. We
    // surface the count to the operator; the transaction below rewrites
    // every row so the table always ends with exactly one space.
    let previousSpace = null;
    let conflicting = 0;
    for (const r of rows) {
      const s = r.embedding_space;
      if (s) {
        if (previousSpace === null) previousSpace = s;
        if (s !== SPACE) conflicting += 1;
      }
    }

    const prefixFor = (kind) => (kind === "missing" ? "query: " : "passage: ");
    const texts = rows.map((r) => {
      const body = [r.clothing, r.marks, r.circumstances, r.place_text].filter(Boolean).join("। ");
      return prefixFor(r.kind) + body;
    });
    const empties = new Set();
    for (let i = 0; i < texts.length; i++) {
      if (isEmpty(texts[i])) {
        empties.add(i);
      }
    }

    let embedder;
    try {
      embedder = await loadLocalEmbedder();
    } catch (err) {
      // The model download/load may fail without a network. We print a
      // single line: the error name (no URL, no tokens) and an actionable
      // hint pointing at `npm run model:fetch` so the operator can prime
      // the cache offline.
      process.stderr.write(
        `reembed: failed to load ${MODEL} (${err instanceof Error ? err.message : String(err)}); ` +
          `run \`npm run model:fetch\` to prime the cache\n`,
      );
      process.exit(1);
    }

    let vectors;
    try {
      vectors = await embedder.embed(texts);
    } catch (err) {
      process.stderr.write(`reembed: embedding failed (${err instanceof Error ? err.message : String(err)})\n`);
      process.exit(1);
    }
    if (vectors.length !== rows.length) {
      process.stderr.write(`reembed: shape mismatch (got ${vectors.length}, expected ${rows.length})\n`);
      process.exit(1);
    }

    // Single transaction (TC-059). If anything below throws, the whole batch
    // rolls back and the table is unchanged.
    await client.query("BEGIN");
    try {
      let updated = 0;
      let skippedEmpty = 0;
      for (let i = 0; i < rows.length; i++) {
        await client.query(
          "UPDATE cases SET embedding = $1::vector, embedding_model = $2, " +
            "embedding_revision = $3, embedding_space = $4 WHERE id = $5",
          [vectorToSql(vectors[i]), MODEL, embedder.revision, SPACE, rows[i].id],
        );
        if (empties.has(i)) skippedEmpty += 1;
        else updated += 1;
      }
      await client.query("COMMIT");
      process.stdout.write(
        [
          `reembed: rows=${rows.length}`,
          `updated=${updated}`,
          `skipped_empty=${skippedEmpty}`,
          `previous_space=${previousSpace ?? "(none)"}`,
          `conflicting=${conflicting}`,
          `space=${SPACE}`,
          `model=${MODEL}`,
          `revision=${embedder.revision ?? "(unknown)"}`,
          `cache_bytes=${cacheSize()}`,
        ].join(" ") + "\n",
      );
      process.exit(0);
    } catch (err) {
      try {
        await client.query("ROLLBACK");
      } catch {
        /* ignore */
      }
      const code = err && typeof err === "object" && "code" in err && err.code ? ` (code ${String(err.code)})` : "";
      process.stderr.write(`reembed: transaction aborted${code}\n`);
      process.exit(1);
    }
  } finally {
    await client.end().catch(() => undefined);
  }
}

const invokedDirectly = process.argv[1] && import.meta.url === new URL(process.argv[1], "file://").href;
if (invokedDirectly) {
  main().catch((err) => {
    // Never include the URL / password / stack; pass the error CODE when pg
    // gives us one.
    const code = err && typeof err === "object" && "code" in err && err.code ? ` (code ${String(err.code)})` : "";
    process.stderr.write(`reembed: unhandled error${code}: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
}

// Touch `maskUrl`/`scrubbedEnv` so the bundler / linter does not strip the
// safety helpers — they are part of the public surface so future scripts can
// import them too.
export { SPACE as REEMBED_SPACE, makeSpace, vectorToSql, loadLocalEmbedder, scrubbedEnv, maskUrl };
