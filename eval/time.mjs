#!/usr/bin/env node
// eval:time — timing study (D2B §17 GOAL-001; TC-020 part).
//
// Reads eval/data/timing.csv (header: participant,method,seconds,completed;
// method is 'assistant' or 'manual'; completed is 'yes' or 'no'). `seconds`
// is required (finite, >= 0) only when completed=yes and must be empty when
// completed=no. Per method prints: attempts N, completed n, completion "n/N",
// and over COMPLETED rows only the median, Q1, Q3, IQR, min and max. The
// paired 5-tester gate counts attempts regardless of completion. The median
// difference uses completed rows only and prints "n/a" if either method has
// none. Fewer than 5 participants with both methods, or an empty file: prints
// "not measured (need >=5 testers, have N)" and exits 0. The card name
// (D6 TASK-041) and the D2B §17 row require 5+ distinct testers.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const DEFAULT_CSV = resolve(__dirname, "data/timing.csv");
const MIN_PARTICIPANTS = 5;
const METHODS = new Set(["assistant", "manual"]);

function parseArgs(argv) {
  const out = { csv: DEFAULT_CSV, errors: [] };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--csv") out.csv = argv[++i];
    else if (arg === "--help" || arg === "-h") out.help = true;
    else out.errors.push(`unknown argument: ${arg}`);
  }
  return out;
}

function helpText() {
  return [
    "node eval/time.mjs — Timing study (D2B §17, GOAL-001).",
    "",
    `Reads ${DEFAULT_CSV} (or --csv <path>) with header:`,
    "  participant,method,seconds,completed",
    "method is 'assistant' or 'manual'; completed is 'yes' or 'no'.",
    "`seconds` is required (finite, >= 0) when completed=yes and must be",
    "empty when completed=no.",
    "",
    "Exits 0 on success and on missing/insufficient inputs (prints 'not measured').",
    "",
  ].join("\n");
}

function notMeasured(reason, have) {
  const tail = have === undefined ? "" : `, have ${have}`;
  return `eval:time: not measured (${reason}${tail})`;
}

function parseCsv(raw) {
  // Small CSV: 4 columns, no quotes, no escapes. Header line required.
  const lines = raw.split(/\r?\n/).filter((line) => line.trim() !== "");
  if (lines.length === 0) return { header: null, rows: [] };
  const header = lines[0].split(",").map((s) => s.trim());
  // Reject the old 3-column header with a clear one-line error so existing
  // fixtures do not silently parse as a no-op.
  if (
    header.length === 3 &&
    header[0] === "participant" &&
    header[1] === "method" &&
    header[2] === "seconds"
  ) {
    throw new Error(
      "header must be 'participant,method,seconds,completed' (4 columns); old 3-column 'completed'-less header is no longer accepted",
    );
  }
  if (
    header.length !== 4 ||
    header[0] !== "participant" ||
    header[1] !== "method" ||
    header[2] !== "seconds" ||
    header[3] !== "completed"
  ) {
    throw new Error(
      `header must be 'participant,method,seconds,completed', got '${lines[0]}'`,
    );
  }
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(",").map((s) => s.trim());
    if (cells.length !== 4) {
      throw new Error(`line ${i + 1}: expected 4 columns, got ${cells.length}`);
    }
    const [participant, method, secondsRaw, completedRaw] = cells;
    if (!METHODS.has(method)) {
      throw new Error(`line ${i + 1}: method must be 'assistant' or 'manual', got '${method}'`);
    }
    if (completedRaw !== "yes" && completedRaw !== "no") {
      throw new Error(`line ${i + 1}: completed must be 'yes' or 'no', got '${completedRaw}'`);
    }
    const completed = completedRaw === "yes";
    let secondsValue = null;
    if (completed) {
      if (secondsRaw === "") {
        throw new Error(`line ${i + 1}: seconds is required when completed=yes, got empty`);
      }
      const value = Number(secondsRaw);
      if (!Number.isFinite(value) || value < 0) {
        throw new Error(`line ${i + 1}: seconds must be a non-negative finite number, got '${secondsRaw}'`);
      }
      secondsValue = value;
    } else {
      if (secondsRaw !== "") {
        throw new Error(`line ${i + 1}: seconds must be empty when completed=no, got '${secondsRaw}'`);
      }
    }
    rows.push({ participant, method, seconds: secondsValue, completed });
  }
  return { header, rows };
}

export function median(values) {
  if (values.length === 0) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

export function quantile(values, q) {
  if (values.length === 0) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  // Linear interpolation, matching numpy default; q in [0,1].
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  const w = pos - lo;
  return sorted[lo] * (1 - w) + sorted[hi] * w;
}

export function iqr(values) {
  if (values.length === 0) return null;
  const q1 = quantile(values, 0.25);
  const q3 = quantile(values, 0.75);
  return { q1, q3, iqr: q3 - q1 };
}

function fmt(value, unit = "") {
  if (value === null || value === undefined) return "n/a";
  return `${value.toFixed(2)}${unit}`;
}

function summariseMethod(name, attempts, completedRows) {
  // `attempts` includes all rows regardless of completion; `completedRows`
  // holds only the rows with a measured `seconds` value.
  const med = median(completedRows);
  const q = iqr(completedRows);
  return {
    name,
    attempts: attempts.length,
    completed: completedRows.length,
    median: med,
    q1: q ? q.q1 : null,
    q3: q ? q.q3 : null,
    iqr: q ? q.iqr : null,
    min: completedRows.length === 0 ? null : Math.min(...completedRows),
    max: completedRows.length === 0 ? null : Math.max(...completedRows),
  };
}

function report({ participants, summaries, medians }) {
  const lines = [];
  lines.push("eval:time summary");
  lines.push(`  participants with both methods: ${participants}`);
  for (const m of summaries) {
    lines.push(
      `  method=${m.name}: attempts=${m.attempts} completed=${m.completed} ` +
        `completion=${m.completed}/${m.attempts} ` +
        `median=${fmt(m.median, "s")} ` +
        `Q1=${fmt(m.q1, "s")} Q3=${fmt(m.q3, "s")} ` +
        `IQR=${fmt(m.iqr, "s")} ` +
        `min=${fmt(m.min, "s")} max=${fmt(m.max, "s")}`,
    );
  }
  if (medians.assistant !== null && medians.manual !== null) {
    lines.push(
      `  median difference (assistant - manual): ${fmt(medians.assistant - medians.manual)}s`,
    );
  } else {
    lines.push("  median difference: n/a (one or both methods have 0 completed rows)");
  }
  return lines.join("\n");
}

export async function run({ csvPath, stdout = process.stdout.write.bind(process.stdout) }) {
  let raw;
  try {
    raw = await readFile(csvPath, "utf8");
  } catch (err) {
    if (err && err.code === "ENOENT") {
      stdout(notMeasured("timing file missing") + "\n");
      return { measured: false, reason: "missing" };
    }
    throw err;
  }
  const parsed = parseCsv(raw);
  const rows = parsed.rows;
  if (rows.length === 0) {
    stdout(notMeasured("empty timing file", 0) + "\n");
    return { measured: false, reason: "empty" };
  }
  const methodsOf = new Map();
  // 5-tester gate: count attempts (any completion state) toward the paired
  // gate. A non-completer is still a recorded attempt for that method.
  for (const r of rows) {
    const set = methodsOf.get(r.participant) ?? new Set();
    set.add(r.method);
    methodsOf.set(r.participant, set);
  }
  const participants = new Set([...methodsOf].filter(([, m]) => m.size === METHODS.size).map(([p]) => p));
  if (participants.size < MIN_PARTICIPANTS) {
    stdout(notMeasured(`need >=${MIN_PARTICIPANTS} testers with both methods, have ${participants.size}`) + "\n");
    return { measured: false, reason: "few-participants" };
  }
  // Per-method: attempts = all rows; completed = rows with a measured seconds.
  const attempts = { assistant: 0, manual: 0 };
  const completed = { assistant: [], manual: [] };
  for (const r of rows) {
    attempts[r.method] += 1;
    if (r.completed) completed[r.method].push(r.seconds);
  }
  const summaries = [
    summariseMethod("assistant", Array(attempts.assistant).fill(0), completed.assistant),
    summariseMethod("manual", Array(attempts.manual).fill(0), completed.manual),
  ];
  // Median difference: completed rows only.
  const medians = {
    assistant: median(completed.assistant),
    manual: median(completed.manual),
  };
  stdout(
    report({ participants: participants.size, summaries, medians }) + "\n",
  );
  return {
    measured: true,
    participants: participants.size,
    attempts,
    completed,
    summaries,
    medians,
  };
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    process.stdout.write(helpText());
    process.exit(0);
  }
  if (args.errors.length) {
    process.stderr.write(`eval:time: ${args.errors.join("; ")}\n`);
    process.exit(2);
  }
  try {
    await run({ csvPath: args.csv });
    process.exit(0);
  } catch (err) {
    process.stderr.write(`eval:time: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  }
}

const invokedDirectly =
  process.argv[1] && import.meta.url === new URL(process.argv[1], "file://").href;
if (invokedDirectly) {
  main();
}

export const __test = { parseArgs, parseCsv, median, quantile, iqr, helpText };
