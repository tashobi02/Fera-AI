#!/usr/bin/env node
// eval:wer — word error rate (D2B §17 GOAL-005; TC-020 part).
//
// Pure WER = word-level Levenshtein over NFC-normalised text, punctuation
// (including the danda U+0964) stripped, whitespace-split. Aggregate WER =
// total edits / total reference words. Reports clip count and reference-word
// count as denominators. Missing input files or zero matched ids -> print
// "eval:wer: not measured (<reason>)" and exit 0. Clips without a hypothesis
// are counted as skipped and printed. This script does NOT call any STT
// provider; it consumes the two JSONL files produced by upstream tasks.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const DEFAULT_REF = resolve(__dirname, "data/wer/references.jsonl");
const DEFAULT_HYP = resolve(__dirname, "data/wer/hypotheses.jsonl");

const DANDA = "\u0964"; // danda
const PUNCT_RE = /[\p{P}\p{S}]/gu; // any Unicode punctuation or symbol
// Extra ranges specific to Bangla text: danda, plus any general punctuation the
// \p{P} class already covers. The class is broad on purpose; we strip the danda
// explicitly so tests that pass it as a non-Latin marker still get WER = 0.

function parseArgs(argv) {
  const out = { ref: null, hyp: null, errors: [] };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--ref") out.ref = argv[++i];
    else if (arg === "--hyp") out.hyp = argv[++i];
    else if (arg === "--help" || arg === "-h") out.help = true;
    else out.errors.push(`unknown argument: ${arg}`);
  }
  out.ref ??= DEFAULT_REF;
  out.hyp ??= DEFAULT_HYP;
  return out;
}

function helpText() {
  return [
    "node eval/wer.mjs — Word Error Rate evaluation (D2B §17, GOAL-005).",
    "",
    "Options:",
    `  --ref <path>   JSONL {id,text} reference transcripts (default ${DEFAULT_REF})`,
    `  --hyp <path>   JSONL {id,text} hypotheses (default ${DEFAULT_HYP})`,
    "  --help         this help",
    "",
    "Exits 0 on success and on missing inputs (prints 'not measured').",
    "",
  ].join("\n");
}

async function readJsonlIfExists(path) {
  try {
    const raw = await readFile(path, "utf8");
    return { path, raw, present: true };
  } catch (err) {
    if (err && err.code === "ENOENT") return { path, raw: "", present: false };
    throw err;
  }
}

function parseJsonl(raw) {
  const out = [];
  raw.split(/\r?\n/).forEach((line, idx) => {
    const trimmed = line.trim();
    if (trimmed === "") return;
    let parsed;
    try {
      parsed = JSON.parse(trimmed);
    } catch (err) {
      throw new Error(`line ${idx + 1}: invalid JSON (${err instanceof Error ? err.message : String(err)})`);
    }
    if (!parsed || typeof parsed !== "object" || typeof parsed.id !== "string" || typeof parsed.text !== "string") {
      throw new Error(`line ${idx + 1}: expected {id:string, text:string}`);
    }
    out.push({ id: parsed.id, text: parsed.text });
  });
  return out;
}

export function normalise(text) {
  // NFC, then strip the danda explicitly plus the Unicode punctuation/symbol
  // classes, then collapse whitespace and split. Empty input -> [].
  const nfc = text.normalize("NFC").replace(DANDA, " ");
  const stripped = nfc.replace(PUNCT_RE, " ");
  return stripped
    .split(/\s+/)
    .filter((w) => w.length > 0);
}

export function levenshtein(refTokens, hypTokens) {
  if (refTokens.length === 0) return hypTokens.length;
  if (hypTokens.length === 0) return refTokens.length;
  const m = refTokens.length;
  const n = hypTokens.length;
  // 2-row DP, indexed by column; prev[j] is the cost to align ref[0..j-1] -> "".
  let prev = new Array(n + 1);
  let curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    const ri = refTokens[i - 1];
    for (let j = 1; j <= n; j++) {
      const cost = ri === hypTokens[j - 1] ? 0 : 1;
      const del = prev[j] + 1; // delete from ref
      const ins = curr[j - 1] + 1; // insert into hyp
      const sub = prev[j - 1] + cost; // substitute
      let v = del < ins ? del : ins;
      if (sub < v) v = sub;
      curr[j] = v;
    }
    const tmp = prev;
    prev = curr;
    curr = tmp;
  }
  return prev[n];
}

export function scorePair(reference, hypothesis) {
  const ref = normalise(reference);
  const hyp = normalise(hypothesis);
  return {
    refWords: ref.length,
    edits: levenshtein(ref, hyp),
  };
}

function pct(numerator, denominator) {
  if (denominator === 0) return null;
  return (numerator / denominator) * 100;
}

function fmtPercent(value) {
  if (value === null) return "n/a";
  return value.toFixed(2) + "%";
}

function reportSummary({ refCount, matched, skipped, totalRefWords, totalEdits, aggregateWer, perClip }) {
  const lines = [];
  lines.push("eval:wer summary");
  lines.push(`  reference clips: ${refCount}`);
  lines.push(`  matched clips:   ${matched}`);
  lines.push(`  skipped (no hypothesis): ${skipped}`);
  lines.push(`  total reference words (denominator): ${totalRefWords}`);
  lines.push(`  total edits: ${totalEdits}`);
  if (aggregateWer === null) {
    lines.push("  aggregate WER: n/a (0 reference words)");
  } else {
    const aggregatePercent = aggregateWer * 100;
    lines.push(`  aggregate WER: ${fmtPercent(aggregatePercent)} (${totalEdits}/${totalRefWords})`);
  }
  for (const row of perClip) {
    const refPart = row.refWords;
    const rate = pct(row.edits, row.refWords);
    lines.push(`  clip ${row.id}: edits=${row.edits} ref_words=${refPart} wer=${fmtPercent(rate)}`);
  }
  return lines.join("\n");
}

function notMeasured(reason) {
  return `eval:wer: not measured (${reason})`;
}

export async function run({ refPath, hypPath, stdout = process.stdout.write.bind(process.stdout) }) {
  const [refFile, hypFile] = await Promise.all([readJsonlIfExists(refPath), readJsonlIfExists(hypPath)]);

  if (!refFile.present && !hypFile.present) {
    stdout(notMeasured("reference and hypothesis files both missing") + "\n");
    return { measured: false, reason: "missing" };
  }
  if (!refFile.present) {
    stdout(notMeasured(`reference file missing: ${refPath}`) + "\n");
    return { measured: false, reason: "missing-ref" };
  }
  if (!hypFile.present) {
    stdout(notMeasured(`hypothesis file missing: ${hypPath}`) + "\n");
    return { measured: false, reason: "missing-hyp" };
  }

  const refs = parseJsonl(refFile.raw);
  if (refs.length === 0) {
    stdout(notMeasured("0 reference clips") + "\n");
    return { measured: false, reason: "empty-ref" };
  }

  const hyps = new Map();
  for (const h of parseJsonl(hypFile.raw)) hyps.set(h.id, h.text);

  let matched = 0;
  let totalRefWords = 0;
  let totalEdits = 0;
  let skipped = 0;
  const perClip = [];

  for (const r of refs) {
    if (!hyps.has(r.id)) {
      skipped++;
      continue;
    }
    const score = scorePair(r.text, hyps.get(r.id));
    matched++;
    totalRefWords += score.refWords;
    totalEdits += score.edits;
    perClip.push({ id: r.id, refWords: score.refWords, edits: score.edits });
  }

  if (matched === 0) {
    stdout(notMeasured("0 matched ids") + "\n");
    return { measured: false, reason: "no-match" };
  }

  const aggregateWer = totalRefWords === 0 ? null : totalEdits / totalRefWords;
  stdout(
    reportSummary({
      refCount: refs.length,
      matched,
      skipped,
      totalRefWords,
      totalEdits,
      aggregateWer,
      perClip,
    }) + "\n",
  );
  return {
    measured: true,
    refCount: refs.length,
    matched,
    skipped,
    totalRefWords,
    totalEdits,
    aggregateWer,
    perClip,
  };
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    process.stdout.write(helpText());
    process.exit(0);
  }
  if (args.errors.length) {
    process.stderr.write(`eval:wer: ${args.errors.join("; ")}\n`);
    process.exit(2);
  }
  try {
    await run({ refPath: args.ref, hypPath: args.hyp });
    process.exit(0);
  } catch (err) {
    process.stderr.write(`eval:wer: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  }
}

const invokedDirectly =
  process.argv[1] && import.meta.url === new URL(process.argv[1], "file://").href;
if (invokedDirectly) {
  main();
}

export const __test = { parseArgs, parseJsonl, normalise, levenshtein, scorePair, helpText };
