#!/usr/bin/env node
// npm run model:fetch (TASK-016): downloads the pinned embedding model files (model.ts:
// MODEL_FILES at EMBEDDING.revision) from huggingface.co into a git-ignored cache
// (./models/hf, or FERA_MODEL_CACHE), checks each SHA-256, then loads the model and
// embeds once. This is the only place that touches the network; the runtime never
// downloads. Model files are never committed (`models/` is in .gitignore).
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { performance } from "node:perf_hooks";
import { EMBEDDING, EMBEDDING_DIM, MODEL_DTYPE, MODEL_FILES, PREFIX, defaultCacheDir, loadLocalEmbedder } from "../src/server/embeddings/model.ts";

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const size = (d) => readdirSync(d, { withFileTypes: true }).reduce((s, e) => s + (e.isDirectory() ? size(join(d, e.name)) : statSync(join(d, e.name)).size), 0);

async function main() {
  const cacheDir = defaultCacheDir();
  console.log(`model:fetch ${EMBEDDING.model}@${EMBEDDING.revision} (${MODEL_DTYPE}) -> ${cacheDir}`);
  const started = performance.now();
  for (const file of MODEL_FILES) {
    const dest = join(cacheDir, EMBEDDING.model, file.path);
    if (existsSync(dest) && sha256(readFileSync(dest)) === file.sha256) {
      console.log(`  ok (cached)  ${file.path}`);
      continue;
    }
    const url = `https://huggingface.co/${EMBEDDING.model}/resolve/${EMBEDDING.revision}/${file.path}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`download failed (${res.status}) for ${file.path}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (sha256(buf) !== file.sha256) throw new Error(`SHA-256 mismatch for ${file.path}; refusing to keep it`);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(`${dest}.part`, buf);
    renameSync(`${dest}.part`, dest);
    console.log(`  ok (downloaded, ${(buf.length / 1048576).toFixed(1)} MiB)  ${file.path}`);
  }
  const embedder = await loadLocalEmbedder({ cacheDir });
  const v = await embedder.embed(`${PREFIX.passage}পরীক্ষা`);
  if (v.length !== EMBEDDING_DIM) throw new Error(`model returned ${v.length} dimensions, expected ${EMBEDDING_DIM}`);
  console.log(`ok: ${v.length}-d vector, ${(size(cacheDir) / 1048576).toFixed(1)} MiB in cache, ${((performance.now() - started) / 1000).toFixed(1)} s`);
}

main().catch((err) => {
  console.error(`model:fetch: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
