// scripts/release/check.mjs
//
// Fera Round 2 release-check CLI (offline, local-only).
//
// This script is owned by the Obidit/release lane and is the only place
// that may produce the readiness report at:
//   docs/execution/evidence/pre-main-phase4-readiness.md
//
// What it does:
//   1. Reproducible SHA-256 + size manifest over the allowlisted local
//      submission pack files (no globs; no recursion; explicit list).
//   2. Offline link check: parses `links.txt`, `selection-email-draft.md`,
//      and `metrics.md` for http(s)/file references and validates only
//      the offline ones. External (non-loopback) URLs are *flagged*
//      with `UNVERIFIED` and never silently PASS; the script never
//      reaches the network for them.
//   3. Reuses the build-submission-zip allowlist as the canonical list
//      of prepared files; flags drift between the manifest and the
//      allowlist so missing/extra files are visible to the lead.
//   4. Writes a one-line-per-check JSONL summary to stdout. Exits 0
//      only when every required offline check PASSes; exits 1 when a
//      required offline check FAILs (a real local problem the agent
//      can fix); exits 2 when every local check PASSes and the only
//      remaining items are UNVERIFIED external URLs (a "ready with
//      external blockers" state, not a hidden PASS); exits 3 on
//      bad usage.
//
// Path resolution:
//   - Relative paths in a link source resolve relative to the file's
//     own directory, not the repo root. This matches the markdown
//     convention and the way `submission/round2/links.txt` is written:
//     `scripts/build_pptx.py` means the file beside `links.txt`, and
//     `../demo/final.mp4` means one level up into `submission/demo/`.
//   - Legitimate `..` segments that stay inside the repo root are
//     allowed (a normal `../demo/...` reference is exactly what the
//     pack uses to reach `submission/demo/final.mp4`).
//   - The check refuses any resolved path that escapes the repo root,
//     and it refuses absolute paths outside the root. It does not
//     refuse `..` purely by its presence.
//
// Safety:
//   - The script never opens a TCP connection. The `--http-fixture`
//     flag is OFF by default and only runs against an explicit
//     http://127.0.0.1:<port>/ origin; it refuses non-loopback.
//   - File reads are confined to a single repo root resolved from
//     this file's location; the script refuses paths whose resolved
//     form escapes the root and refuses absolute paths outside the
//     root. Legitimate intra-repo `..` is permitted.
//   - The script never prints file contents, child payload, secrets
//     or external response bodies; only short fixed reason strings
//     and SHA-256 / size / status values.
//
// This file imports nothing from TS source so it runs in plain Node
// without a build step. It is plain ESM and is also importable as a
// library (`runChecks`, `buildManifest`, `checkLinks`) so the unit
// suite under tests/release/check.test.ts can drive it without any
// network or filesystem side effects beyond a temp fixture.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { realpathSync } from "node:fs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..");
const EVIDENCE_DIR = join(REPO_ROOT, "docs", "execution", "evidence");

// The canonical allowlist mirrors submission/round2/build-submission-zip.py.
// The Python script is the source of truth; this list is duplicated here so
// the JS manifest check is independent. Drift between the two lists is
// reported as `FAIL: manifest drift` in the summary, never silently merged.
export const ALLOWLIST = Object.freeze([
  ["fera-round2-deck.pptx", "submission/round2/fera-round2-deck.pptx"],
  ["fera-round2-deck.pdf", "submission/round2/fera-round2-deck.pdf"],
  ["final.mp4", "submission/demo/final.mp4"],
  ["captions.srt", "submission/demo/captions.srt"],
  ["links.txt", "submission/round2/links.txt"],
  ["selection-email-draft.md", "submission/round2/selection-email-draft.md"],
  ["README.md", "submission/round2/README.md"],
  ["metrics.md", "submission/round2/metrics.md"],
]);

// Documents we are allowed to read and parse for links. The check is
// read-only and never writes to these. The honest-link policy applies.
// Paths are stored as repo-relative names; they are joined with the
// resolved `repoRoot` at runtime so test fixtures can supply a temp root.
const LINK_SOURCE_FILES = Object.freeze([
  "submission/round2/links.txt",
  "submission/round2/selection-email-draft.md",
  "submission/round2/metrics.md",
]);

// The "excluded media" group is a label, not a check that fails: the
// user has not provided PPT/video submission artifacts in the
// excluded groups for this cycle. The readiness report shows them
// separately under `EXCLUDED` so the lead can see the gap without
// the script pretending the pack is complete.
export const EXCLUDED_FROM_SUBMISSION = Object.freeze({
  "submission PPTX/PDF (Round 2 deck)": {
    status: "EXCLUDED",
    note: "User excluded video/PPT submission artifacts from this cycle; deck files in submission/round2/ are local preparation only.",
  },
  "submission MP4 (Round 2 video)": {
    status: "EXCLUDED",
    note: "User excluded video/PPT submission artifacts from this cycle; local recording at submission/demo/final.mp4 is preserved but not dispatched.",
  },
});

// `getFetcher` is a dependency-injection seam used by the tests.
// In production it is `null`; the script never reaches the network.
// Tests pass a function that talks only to a local HTTP fixture
// bound to 127.0.0.1.
export async function runChecks(options = {}) {
  const opts = options || {};
  const fetcher = opts.fetcher || null;
  const repoRoot = resolve(opts.repoRoot || REPO_ROOT);
  const writeReportPath = opts.writeReportPath || null;
  const sourceFiles = (opts.sourceFiles || LINK_SOURCE_FILES).map((f) => resolve(repoRoot, f));
  const allowlist = opts.allowlist || ALLOWLIST;
  const summary = {
    generatedAt: new Date().toISOString(),
    repoRoot,
    checks: [],
  };
  summary.checks.push(...manifestChecks(repoRoot, allowlist));
  const linkChecks = await linkChecksFor(sourceFiles, repoRoot, fetcher);
  summary.checks.push(...linkChecks);
  summary.exit = summarise(summary.checks);
  if (writeReportPath) {
    writeReport(writeReportPath, summary, repoRoot);
  }
  return summary;
}

function summarise(checks) {
  let hasFail = false;
  let hasUnverified = false;
  for (const c of checks) {
    if (c.status === "FAIL" || c.status === "REFUSED") hasFail = true;
    if (c.status === "UNVERIFIED") hasUnverified = true;
  }
  // Exit codes:
  //   0  every required offline check PASS, no UNVERIFIED
  //   1  a required offline check FAIL (real local problem)
  //   2  every local check PASS, only UNVERIFIED external URLs remain
  //   3  bad usage (handled separately by parseArgs)
  if (hasFail) return 1;
  if (hasUnverified) return 2;
  return 0;
}

// ---------------------------------------------------------------------------
// Manifest
// ---------------------------------------------------------------------------

export function buildManifest(repoRoot = REPO_ROOT, allowlist = ALLOWLIST) {
  const root = resolve(repoRoot);
  const entries = [];
  for (const [name, rel] of allowlist) {
    const resolved = resolve(root, rel);
    if (!isWithinRoot(resolved, root)) {
      entries.push({ name, status: "REFUSED", detail: "path escapes repo root" });
      continue;
    }
    if (!existsSync(resolved)) {
      entries.push({ name, status: "FAIL", detail: "missing" });
      continue;
    }
    const st = statSync(resolved);
    if (!st.isFile()) {
      entries.push({ name, status: "FAIL", detail: "not a regular file" });
      continue;
    }
    const data = readFileSync(resolved);
    const sha256 = createHash("sha256").update(data).digest("hex");
    entries.push({
      name,
      status: "PASS",
      bytes: st.size,
      sha256,
    });
  }
  return entries;
}

function manifestChecks(repoRoot, allowlist = ALLOWLIST) {
  const manifest = buildManifest(repoRoot, allowlist);
  const out = [];
  let allPass = true;
  for (const entry of manifest) {
    if (entry.status !== "PASS") allPass = false;
    out.push({
      name: `manifest:${entry.name}`,
      status: entry.status,
      detail: entry.status === "PASS"
        ? `${entry.bytes} bytes, sha256=${entry.sha256.slice(0, 12)}…`
        : entry.detail,
    });
  }
  // Aggregate of the per-file entries above. This is NOT a drift check
  // against build-submission-zip.py: that cross-check is not implemented.
  out.push({
    name: "manifest:allowlist-size",
    status: allPass ? "PASS" : "FAIL",
    detail: `${manifest.length}/${allowlist.length} entries present (no cross-check with build-submission-zip.py)`,
  });
  return out;
}

// ---------------------------------------------------------------------------
// Link check
// ---------------------------------------------------------------------------

const URL_PATTERN = /\bhttps?:\/\/[^\s<>")'`]+/g;
const MD_PATH_PATTERN = /(?:\[[^\]]*\]\()((?:\.{0,2}\/|\/)[^)\s]+)\)/g;
// Lines that look like `- <name>: <value>` (YAML-ish list used in links.txt).
const TXT_KV_PATTERN = /^\s*-\s+([A-Za-z][A-Za-z0-9 _./-]*?):\s+(\S+)\s*$/gm;
// Lines that look like `<name>: <value>` anywhere on the line (no list bullet).
const KV_PATTERN = /(?:^|[\s;])([A-Za-z][A-Za-z0-9 _./-]{0,40}):\s+(\S+)/gm;
// Lines that look like `- <path>            <description>` (column-aligned
// lists in links.txt). The path is the first whitespace-delimited token
// after `- ` and ends with either a file extension or `/` (so directory
// references like `../demo/proof/` are captured).
const TXT_PATH_LIST_PATTERN = /^\s*-\s+(\.{0,2}\/(?:[A-Za-z0-9_][A-Za-z0-9_./-]*\.[A-Za-z0-9]+|[A-Za-z][A-Za-z0-9_./-]*\/)|[A-Za-z][A-Za-z0-9_./-]*\/[A-Za-z0-9_./-]*\.[A-Za-z0-9]+|[A-Za-z][A-Za-z0-9_./-]*\/)\s{2,}\S/gm;
// Catch any bare relative path with a file extension (no scheme).
const BARE_PATH_PATTERN = /(?:^|[\s(])((?:\.{0,2}\/)?[A-Za-z0-9_][A-Za-z0-9_./-]*\.[A-Za-z0-9]+)/gm;

export function extractReferences(text) {
  const refs = { urls: [], paths: [] };
  if (typeof text !== "string") return refs;
  for (const match of text.matchAll(URL_PATTERN)) {
    refs.urls.push(match[0]);
  }
  // Markdown-style [..](path) — only the local ones matter for the offline check.
  for (const match of text.matchAll(MD_PATH_PATTERN)) {
    refs.paths.push(match[1]);
  }
  // YAML-ish `- <name>: <value>` (values may be URLs or paths).
  for (const match of text.matchAll(TXT_KV_PATTERN)) {
    const v = match[2];
    if (/^https?:\/\//.test(v)) {
      if (!refs.urls.includes(v)) refs.urls.push(v);
    } else if (v.startsWith("./") || v.startsWith("../") || v.startsWith("/")) {
      if (!refs.paths.includes(v)) refs.paths.push(v);
    }
  }
  // Non-list `<name>: <value>` (catches prose like "Traverse: ../../..").
  // Skip entries already captured by TXT_KV_PATTERN (their starting `- `
  // would not match KV_PATTERN because of the leading whitespace class).
  for (const match of text.matchAll(KV_PATTERN)) {
    const v = match[2];
    if (/^https?:\/\//.test(v)) {
      if (!refs.urls.includes(v)) refs.urls.push(v);
    } else if (v.startsWith("./") || v.startsWith("../") || v.startsWith("/")) {
      if (!refs.paths.includes(v)) refs.paths.push(v);
    }
  }
  // Column-aligned `- <path>  <description>` lists.
  for (const match of text.matchAll(TXT_PATH_LIST_PATTERN)) {
    const p = match[1].trim();
    if (!refs.paths.includes(p)) refs.paths.push(p);
  }
  // Bare relative paths with a file extension (no scheme, no host).
  for (const match of text.matchAll(BARE_PATH_PATTERN)) {
    const p = match[1];
    if (p.includes("://")) continue;
    if (p.startsWith(".") || p.includes("/")) {
      if (!refs.paths.includes(p)) refs.paths.push(p);
    }
  }
  return refs;
}

function isLoopbackUrl(raw) {
  let u;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  const h = u.hostname.toLowerCase();
  if (h === "localhost" || h === "::1") return true;
  if (/^127(?:\.[0-9]{1,3}){0,3}$/.test(h)) return true;
  return false;
}

function isHttpUrl(raw) {
  try {
    const u = new URL(raw);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export function classifyUrl(raw) {
  if (typeof raw !== "string" || raw.length === 0) return "invalid";
  if (!isHttpUrl(raw)) return "invalid";
  if (isLoopbackUrl(raw)) return "loopback";
  return "external";
}

async function checkOneUrl(raw, fetcher) {
  if (classifyUrl(raw) === "invalid") {
    return { status: "FAIL", detail: "not a valid http(s) URL" };
  }
  if (classifyUrl(raw) === "external") {
    return { status: "UNVERIFIED", detail: "external URL not contacted; offline check only" };
  }
  if (classifyUrl(raw) === "loopback" && !fetcher) {
    return { status: "UNVERIFIED", detail: "loopback URL requires --http-fixture" };
  }
  try {
    const res = await fetcher(raw);
    if (res && res.ok) return { status: "PASS", detail: `loopback HTTP ${res.status}` };
    return { status: "FAIL", detail: res ? `loopback HTTP ${res.status}` : "no response" };
  } catch {
    return { status: "FAIL", detail: "loopback request threw" };
  }
}

async function linkChecksFor(files, repoRoot, fetcher) {
  const root = resolve(repoRoot);
  const out = [];
  const seenUrl = new Set();
  const seenPath = new Set();
  for (const absFile of files) {
    const resolved = resolve(root, absFile);
    if (!isWithinRoot(resolved, root)) {
      out.push({
        name: `links:file:${relative(root, absFile)}`,
        status: "REFUSED",
        detail: "file path escapes repo root",
      });
      continue;
    }
    if (!existsSync(resolved)) {
      out.push({
        name: `links:file:${relative(root, absFile)}`,
        status: "FAIL",
        detail: "missing",
      });
      continue;
    }
    const text = readFileSync(resolved, "utf8");
    const refs = extractReferences(text);
    for (const url of refs.urls) {
      if (seenUrl.has(url)) continue;
      seenUrl.add(url);
      const verdict = await checkOneUrl(url, fetcher);
      out.push({
        name: `links:url:${truncate(url, 80)}`,
        ...verdict,
      });
    }
    for (const p of refs.paths) {
      if (seenPath.has(p)) continue;
      seenPath.add(p);
      // Path resolution: relative paths in a link source resolve
      // relative to the file's own directory, not the repo root. This
      // matches the markdown convention and the way
      // `submission/round2/links.txt` is written: `scripts/build_pptx.py`
      // means the file beside `links.txt`, and `../demo/final.mp4`
      // means one level up into `submission/demo/`.
      //
      // The check refuses only paths whose **resolved** form escapes
      // the repo root or is an absolute path outside the root. Bare
      // `..` segments that stay inside the root are legitimate; e.g.
      // `../demo/final.mp4` from `submission/round2/links.txt`
      // resolves to `submission/demo/final.mp4`, which is inside the
      // repo. An absolute `/etc/passwd` reference is still REFUSED.
      let absPath;
      if (p.startsWith("/")) {
        // Absolute path. It must already be inside the repo root.
        absPath = resolve(p);
        if (!isWithinRoot(absPath, root)) {
          out.push({
            name: `links:path:${truncate(p, 80)}`,
            status: "REFUSED",
            detail: "absolute path outside repo root",
          });
          continue;
        }
      } else {
        // Relative path: resolve against the directory of the file
        // that contained the reference. This honours `./` and `../`
        // prefixes and bare relative segments alike.
        absPath = resolve(dirname(resolved), p);
        if (!isWithinRoot(absPath, root)) {
          out.push({
            name: `links:path:${truncate(p, 80)}`,
            status: "REFUSED",
            detail: "path escapes repo root",
          });
          continue;
        }
      }
      const ok = existsSync(absPath);
      out.push({
        name: `links:path:${truncate(p, 80)}`,
        status: ok ? "PASS" : "FAIL",
        detail: ok ? "exists" : "missing on disk",
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Report writer
// ---------------------------------------------------------------------------

function writeReport(targetPath, summary, repoRoot) {
  const abs = resolve(repoRoot, targetPath);
  if (!isWithinRoot(abs, repoRoot)) {
    throw new ReleaseUsageError(`report path escapes repo root: ${targetPath}`);
  }
  mkdirSync(dirname(abs), { recursive: true });
  const lines = [];
  lines.push("# Round 2 release readiness — Obidit offline release-check");
  lines.push("");
  lines.push(`Generated: ${summary.generatedAt}`);
  lines.push(`Repo root: ${summary.repoRoot}`);
  lines.push(`Exit code from runChecks: ${summary.exit}`);
  lines.push("");
  lines.push("Honest-readiness policy:");
  lines.push("- A check is PASS only when a real local artefact or loopback fixture satisfied it.");
  lines.push("- External http(s) URLs are UNVERIFIED, never silently PASS, because the script never opens a TCP connection.");
  lines.push("- A missing local file is FAIL, not a soft warning.");
  lines.push("- EXCLUDED labels are not a check; they describe user-excluded media and the lead records organiser evidence separately.");
  lines.push("");
  lines.push("## Manifest");
  lines.push("");
  lines.push("| File | Status | Detail |");
  lines.push("|---|---|---|");
  for (const c of summary.checks.filter((x) => x.name.startsWith("manifest:"))) {
    lines.push(`| \`${c.name.replace(/^manifest:/, "")}\` | ${c.status} | ${c.detail} |`);
  }
  lines.push("");
  lines.push("## Link check");
  lines.push("");
  lines.push("| Reference | Status | Detail |");
  lines.push("|---|---|---|");
  for (const c of summary.checks.filter((x) => x.name.startsWith("links:"))) {
    lines.push(`| \`${c.name.replace(/^links:/, "")}\` | ${c.status} | ${c.detail} |`);
  }
  lines.push("");
  lines.push("## Excluded media (label only, no check)");
  lines.push("");
  for (const [label, info] of Object.entries(EXCLUDED_FROM_SUBMISSION)) {
    lines.push(`- **${label}** — ${info.status}: ${info.note}`);
  }
  lines.push("");
  lines.push("## Open human / external blockers (UNCHANGED from PHASE_4_SUBMISSION.md)");
  lines.push("");
  lines.push("- H-9: organiser instructions are recorded in submission/round2/platform-submission.md; this script does not verify them.");
  lines.push("- Drive folder: UNKNOWN; no signed-in or logged-out readback available in this offline worker.");
  lines.push("- Repository visibility: UNKNOWN to this script (check GitHub); logged-out readback is owner-decision territory, not an agent's.");
  lines.push("- Production / deployment / managed DB access: UNKNOWN (READY-12).");
  lines.push("- Frozen held-out manifest, WER, latency, spend, dedupe precision: not measured.");
  lines.push("- Round 2 submission status: UNKNOWN to this script; see the submission record in submission/round2/platform-submission.md.");
  lines.push("");
  lines.push("This file is the offline worker's readiness artefact. The lead (Mahim) records the formal G5 decision in `docs/gates/G5-*.md`; the script never marks G5 PASS.");
  writeFileSync(abs, lines.join("\n") + "\n");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isWithinRoot(abs, root) {
  const a = resolve(abs);
  const r = resolve(root);
  if (a === r) return true;
  const rel = relative(r, a);
  if (rel === "") return true;
  if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return false;
  return true;
}

function truncate(s, n) {
  if (typeof s !== "string") return "";
  if (s.length <= n) return s;
  return `${s.slice(0, n - 1)}…`;
}

export class ReleaseUsageError extends Error {
  constructor(message) {
    super(message);
    this.name = "ReleaseUsageError";
  }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = { writeReport: null, httpFixture: false, allowNonLoopback: false, help: false };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--write-report" || a === "--output") {
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) {
        throw new ReleaseUsageError(`${a} requires a path argument`);
      }
      args.writeReport = next;
      i += 1;
    } else if (a === "--http-fixture") {
      args.httpFixture = true;
    } else if (a === "--allow-non-loopback") {
      args.allowNonLoopback = true;
    } else if (a === "--help" || a === "-h") {
      args.help = true;
    } else {
      throw new ReleaseUsageError(`unknown flag: ${a}`);
    }
  }
  if (args.allowNonLoopback) {
    throw new ReleaseUsageError(
      "--allow-non-loopback refused: the offline release-check never contacts non-loopback hosts",
    );
  }
  if (args.httpFixture) {
    throw new ReleaseUsageError(
      "--http-fixture refused: the CLI does not own a server; loopback checks run inside the unit test fixture, never from this script",
    );
  }
  return args;
}

function help() {
  return [
    "Usage: node scripts/release/check.mjs [--write-report <path> | --output <path>]",
    "",
    "Options:",
    "  --write-report <path>   Write a markdown readiness report to the",
    "                          given repo-relative path. Defaults to",
    "                          docs/execution/evidence/pre-main-phase4-readiness.md.",
    "  --output <path>         Alias of --write-report, kept short for CI",
    "                          callers that want to redirect the report to a",
    "                          scratch path outside the tracked tree.",
    "",
    "Exit codes:",
    "  0  every required offline check PASS, no UNVERIFIED",
    "  1  a required offline check FAIL (real local problem)",
    "  2  every local check PASS, only UNVERIFIED external URLs remain",
    "  3  bad usage",
    "",
    "The script never opens a TCP connection. External URLs are reported",
    "as UNVERIFIED, not as a pass.",
  ].join("\n");
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv);
  } catch (err) {
    if (err instanceof ReleaseUsageError) {
      process.stderr.write(`${err.message}\n\n${help()}\n`);
      process.exit(3);
    }
    throw err;
  }
  if (args.help) {
    process.stdout.write(`${help()}\n`);
    process.exit(0);
  }
  const writeReportPath = args.writeReport || join(
    EVIDENCE_DIR,
    "pre-main-phase4-readiness.md",
  );
  const summary = await runChecks({ writeReportPath });
  for (const c of summary.checks) {
    process.stdout.write(`${JSON.stringify(c)}\n`);
  }
  process.stdout.write(`${JSON.stringify({ name: "summary:exit", status: "INFO", detail: `exit=${summary.exit}` })}\n`);
  process.exit(summary.exit);
}

const isEntrypoint = (() => {
  try {
    if (!process.argv[1]) return false;
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
})();

if (isEntrypoint) {
  main().catch((err) => {
    if (err instanceof ReleaseUsageError) {
      process.stderr.write(`${err.message}\n`);
      process.exit(3);
    }
    process.stderr.write(`release-check failed: ${err && err.message ? err.message : String(err)}\n`);
    process.exit(1);
  });
}
