// TASK-004 embedding spike (OQ-023, RISK-015). SYNTHETIC data only.
// Usage: node scripts/embed-spike.mjs [--cache .cache/models] [--dtype fp32|q8]
// Measures multilingual-e5-small (Transformers.js, mean pool + L2) on data/synthetic.
// Not a held-out result: template-generated text.
import { readFileSync, readdirSync, statSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { performance } from "node:perf_hooks";

const MODEL = "Xenova/multilingual-e5-small";
const ci = process.argv.indexOf("--cache");
const CACHE = ci > -1 ? process.argv[ci + 1] : ".cache/models";
const di = process.argv.indexOf("--dtype");
const arg = (n, d) => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : d; };
const QP = arg("--query-prefix", "passage: "); // default: passage: on both sides
const PP = arg("--passage-prefix", "passage: ");
const DTYPE = di > -1 ? process.argv[di + 1] : "fp32";
mkdirSync(CACHE, { recursive: true });

const recs = readFileSync("data/synthetic/records.jsonl", "utf8").trim().split("\n").map((l) => JSON.parse(l));
const gt = JSON.parse(readFileSync("data/synthetic/ground_truth.json", "utf8")).records;
const gtById = new Map(gt.map((r) => [r.record_id, r]));

const dirSize = (d) => readdirSync(d, { withFileTypes: true }).reduce((s, e) => s + (e.isDirectory() ? dirSize(join(d, e.name)) : statSync(join(d, e.name)).size), 0);
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)]; };
const mean = (a) => a.reduce((s, x) => s + x, 0) / (a.length || 1);
const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
const f = (x) => (x === undefined || Number.isNaN(x) ? "n/a" : x.toFixed(4));

const { pipeline, env } = await import("@huggingface/transformers");
env.cacheDir = CACHE;

const t0 = performance.now();
const extractor = await pipeline("feature-extraction", MODEL, { dtype: DTYPE });
const warm = await extractor("passage: warm-up", { pooling: "mean", normalize: true });
const coldMs = performance.now() - t0;
const dim = warm.dims[1];
const onnxName = DTYPE === "fp32" ? "model.onnx" : DTYPE === "q8" ? "model_quantized.onnx" : `model_${DTYPE}.onnx`;
const modelBytes = statSync(join(CACHE, MODEL, "onnx", onnxName)).size; // weight file only
const cacheBytes = dirSize(CACHE);

const fieldText = (r) => {
  const d = r.draft, c = d.child ?? {}, e = d.event ?? {};
  return [c.clothing, c.marks, e.circumstances, e.place_text].filter(Boolean).join("। ");
};
const variants = { source_text: (r) => r.draft.source_text, description_fields: fieldText };

const out = { model: MODEL, dtype: DTYPE, dim, coldMs, modelBytes, onnxName, cacheBytes, queryPrefix: QP, passagePrefix: PP, n: recs.length, variants: {} };

for (const [vname, getText] of Object.entries(variants)) {
  const lat = [];
  const vec = new Map();
  for (const r of recs) {
    const text = getText(r) || "";
    const s = performance.now();
    const o = await extractor((r.kind === "missing" ? QP : PP) + text, { pooling: "mean", normalize: true });
    lat.push(performance.now() - s);
    vec.set(r.record_id, Float32Array.from(o.data));
  }
  const cos = (a, b) => dot(vec.get(a), vec.get(b));
  const found = recs.filter((r) => r.kind === "found").map((r) => r.record_id);
  const queries = gt.filter((r) => r.role === "pair_query");
  const noMatch = gt.filter((r) => r.role === "no_match_query");

  const truePairs = [], ranks = [];
  for (const q of queries) {
    const scored = found.map((id) => [id, cos(q.record_id, id)]).sort((a, b) => b[1] - a[1]);
    const truth = new Set(q.true_partner_ids);
    const idx = scored.findIndex(([id]) => truth.has(id));
    ranks.push(idx < 0 ? Infinity : idx + 1);
    for (const t of q.true_partner_ids) truePairs.push(cos(q.record_id, t));
  }
  const decoyCos = [];
  for (const r of gt) for (const t of r.decoy_target_ids ?? []) if (vec.has(t)) decoyCos.push(cos(r.record_id, t));
  // seeded LCG for reproducible random cross-kind pairs
  let seed = 12345; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const missing = recs.filter((r) => r.kind === "missing").map((r) => r.record_id);
  const trueSet = new Set(gt.flatMap((r) => r.true_partner_ids.map((t) => r.record_id + "|" + t)));
  const randCos = [];
  while (randCos.length < 1000) {
    const m = missing[Math.floor(rnd() * missing.length)], fd = found[Math.floor(rnd() * found.length)];
    if (!trueSet.has(m + "|" + fd) && !trueSet.has(fd + "|" + m)) randCos.push(cos(m, fd));
  }
  const nmTop1 = noMatch.map((q) => Math.max(...found.map((id) => cos(q.record_id, id))));
  // per (query variant x partner variant) breakdown + misses
  const groups = new Map(), misses = [];
  queries.forEach((q, i) => {
    const best = q.true_partner_ids.map((t) => [t, cos(q.record_id, t)]).sort((a, b) => b[1] - a[1])[0][0];
    const key = q.source_variant + " -> " + gtById.get(best).source_variant;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(ranks[i]);
    if (ranks[i] > 5) misses.push({ label: q.label, qv: q.source_variant, pv: gtById.get(best).source_variant, rank: ranks[i] });
  });
  const mk = (rs) => ({ n: rs.length, h1: rs.filter((r) => r <= 1).length, h3: rs.filter((r) => r <= 3).length, h5: rs.filter((r) => r <= 5).length, mrr: mean(rs.map((r) => 1 / r)) });
  const byVariant = Object.fromEntries([...groups].sort().map(([k, rs]) => [k, mk(rs)]));
  const sameRs = [...groups].filter(([k]) => k.split(" -> ")[0] === k.split(" -> ")[1]).flatMap(([, rs]) => rs);
  const sameVariant = mk(sameRs);
  const hit = (k) => ranks.filter((r) => r <= k).length;
  out.variants[vname] = {
    latencyMs: { n: lat.length, median: pct(lat, 0.5), p95: pct(lat, 0.95), mean: mean(lat) },
    nFound: found.length, nQueries: queries.length, nTruePairCos: truePairs.length,
    truePairMean: mean(truePairs), decoyN: decoyCos.length, decoyMean: mean(decoyCos),
    randomN: randCos.length, randomMean: mean(randCos),
    hit1: hit(1), hit3: hit(3), hit5: hit(5), mrr: mean(ranks.map((r) => 1 / r)),
    noMatchN: nmTop1.length, noMatchTop1: { min: Math.min(...nmTop1), median: pct(nmTop1, 0.5), max: Math.max(...nmTop1), mean: mean(nmTop1) },
    byVariant, sameVariant, misses,
    trueMin: Math.min(...truePairs), trueMedian: pct(truePairs, 0.5),
  };
}

console.log(JSON.stringify(out, null, 2));
const mb = (b) => (b / 1048576).toFixed(1);
console.log(`\nmodel=${MODEL} dtype=${DTYPE} dim=${dim} weights=${onnxName} ${modelBytes} B (${mb(modelBytes)} MiB) cache_dir_bytes=${cacheBytes} prefixes query=${JSON.stringify(QP)} passage=${JSON.stringify(PP)} cold_load+first_embed_ms=${coldMs.toFixed(0)}`);
for (const [n, v] of Object.entries(out.variants)) {
  console.log(`\n[${n}] latency ms median=${f(v.latencyMs.median)} p95=${f(v.latencyMs.p95)} (n=${v.latencyMs.n})`);
  console.log(`  cos true=${f(v.truePairMean)} (n=${v.nTruePairCos}) decoy=${f(v.decoyMean)} (n=${v.decoyN}) random=${f(v.randomMean)} (n=${v.randomN})`);
  console.log(`  Hit@1=${v.hit1}/${v.nQueries} Hit@3=${v.hit3}/${v.nQueries} Hit@5=${v.hit5}/${v.nQueries} MRR=${f(v.mrr)} (candidates=${v.nFound})`);
  console.log(`  no-match top1 cos n=${v.noMatchN} min=${f(v.noMatchTop1.min)} median=${f(v.noMatchTop1.median)} max=${f(v.noMatchTop1.max)}; true-pair cos min=${f(v.trueMin)} median=${f(v.trueMedian)}`);
  console.log("  by query->partner variant (n h1 h3 h5 mrr): " + Object.entries(v.byVariant).map(([k, g]) => `${k}: ${g.n} ${g.h1} ${g.h3} ${g.h5} ${f(g.mrr)}`).join(" | "));
  console.log(`  same-variant only: n=${v.sameVariant.n} Hit@1=${v.sameVariant.h1} Hit@3=${v.sameVariant.h3} Hit@5=${v.sameVariant.h5} MRR=${f(v.sameVariant.mrr)}`);
  console.log("  Hit@5 misses: " + (v.misses.map((m) => `${m.label}(${m.qv}->${m.pv}, rank ${m.rank})`).join("; ") || "none"));
}
