// Guard helpers for the Fera offline stack (TASK-053, revised).
//
// Every guard returns OK-or-throws; they are the single source of truth
// for "is this URL / container / DB / volume / state path actually ours?"
// The rules:
//
//   * No network egress. The runtime downloader (scripts/model-fetch.mjs)
//     is intentionally not used here — the offline stack ships the
//     pinned model cache as bytes only.
//   * No shared / human / demo container. The dedicated port and the
//     dedicated container / volume name are derived per worktree so
//     two lanes on the same host cannot collide.
//   * Owner label. Every docker resource this stack creates carries
//     the label `fera.offline-stack.owner=<worktree-id>` so a
//     same-name foreign resource is refused even if the name matches.
//   * DB name MUST be a dedicated `fera_demo_premain_…` loopback DB
//     (the regular `^fera[a-z0-9_]*$` guard would accept `fera` —
//     this guard explicitly forbids it).
//   * State file MUST be under the worktree-owned `.demo/` directory.
//   * Errors are sanitized: no password, no full URL with credentials,
//     no child payload — only fixed short reason strings.
//
// All constants and helpers are pure: no IO, no process spawn, so they
// can be unit-tested without Docker, Postgres or the daemon.
import { realpathSync, lstatSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";

// ---- Dedicated ports -----------------------------------------------------
// The dedicated PostgreSQL loopback port. Distinct from the
// human / dev `fera-db` (54322) so a stray env var cannot target the
// shared DB.
export const DEMO_PORT = 3215;
// The dedicated Next.js app port. Distinct from `DEMO_PORT` (3215) so
// the operator can copy the `next start` instructions literally
// without conflicting ports. Also distinct from the default Next.js
// 3000 so a side-by-side dev server can keep running.
export const DEMO_APP_PORT = 3216;

// ---- Per-worktree identity ----------------------------------------------
// `ownerLabel()` builds the value stored in the docker label that marks
// a resource as "owned by this offline stack instance". It is a stable
// 16-char hex of the worktree path so a re-boot on the same worktree
// regenerates the same label. Resources missing the label are refused
// even if their name happens to match.
export const OWNER_LABEL_KEY = "fera.offline-stack.owner";
export const SCHEMA_LABEL_KEY = "fera.offline-stack.schema";
export const KIND_LABEL_KEY = "fera.offline-stack.kind";

export function ownerLabel(worktreeRoot) {
  if (typeof worktreeRoot !== "string" || worktreeRoot.length === 0) {
    throw new Error("offline-stack: worktree root is required to compute the owner label");
  }
  return createHash("sha256").update(realpathOr(worktreeRoot)).digest("hex").slice(0, 16);
}

// Shared container / volume / network name root. Two worktrees on the
// same host get distinct names; rebuilding on the same worktree yields
// the same name.
export function resourcePrefix(worktreeRoot) {
  return `fera-demo-${ownerLabel(worktreeRoot)}`;
}

export function containerNameFor(worktreeRoot) {
  return `${resourcePrefix(worktreeRoot)}-pg`;
}

export function volumeNameFor(worktreeRoot) {
  return `${resourcePrefix(worktreeRoot)}-pgdata`;
}

export function networkNameFor(worktreeRoot) {
  return `${resourcePrefix(worktreeRoot)}-net`;
}

// Short, human-readable alias for status output. Always derived from
// the owner label so a foreign resource never has the same alias.
export function shortAlias(worktreeRoot) {
  return ownerLabel(worktreeRoot).slice(0, 8);
}

// ---- Image + DB prefix ---------------------------------------------------
// The image is built from db/docker/Dockerfile (TASK-002). We pin the
// tag so a re-push cannot silently change the runtime.
export const DEMO_IMAGE = "fera-pg16-pgvector:0.8.1";
// The dedicated DB prefix. The regular guard (scripts/db/guard.mjs)
// accepts any `^fera[a-z0-9_]{0,40}$` name; this guard narrows it to
// the offline stack's own prefix so a typo in DATABASE_URL cannot be
// applied to the human/dev `fera` DB or to another lane's `fera_e2e_*`
// / `fera_test_*` DBs.
export const DEMO_DB_PREFIX = "fera_demo_premain_";
export const DEMO_DB_MAX_SUFFIX = 32;
// Bumped if the persisted state shape changes incompatibly. The state
// loader refuses unknown versions; the writer always sets this.
export const PROVENANCE_SCHEMA_VERSION = "offline-stack-v2";

// ---- URL guards ----------------------------------------------------------
const LOOPBACK = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function realpathOr(p) {
  try {
    return realpathSync(p);
  } catch {
    return resolve(p);
  }
}

function makeUrl(raw) {
  if (typeof raw !== "string" || raw.length === 0) {
    throw new Error("offline-stack: a loopback URL is required");
  }
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("offline-stack: not a valid URL");
  }
  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    throw new Error("offline-stack refuses a non-postgresql URL");
  }
  if (url.search !== "" || url.hash !== "") {
    throw new Error("offline-stack refuses connection parameters in URL");
  }
  if (!LOOPBACK.has(url.hostname)) {
    throw new Error(`offline-stack refuses non-loopback host ${url.hostname}`);
  }
  return url;
}

export function assertLoopbackUrl(raw) {
  return makeUrl(raw);
}

export function assertDemoPort(port) {
  if (port === 54322) {
    throw new Error("offline-stack refuses the human/dev fera-db port 54322");
  }
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error(`offline-stack: invalid port ${port}`);
  }
  return port;
}

export function assertDemoContainerName(name, worktreeRoot) {
  const expected = containerNameFor(worktreeRoot);
  if (name !== expected) {
    throw new Error(`offline-stack refuses non-owned container ${String(name)} (expected ${expected})`);
  }
  return name;
}

export function assertDemoVolumeName(name, worktreeRoot) {
  const expected = volumeNameFor(worktreeRoot);
  if (name !== expected) {
    throw new Error(`offline-stack refuses non-owned volume ${String(name)} (expected ${expected})`);
  }
  return name;
}

export function assertDemoDatabaseName(name) {
  if (typeof name !== "string" || name.length === 0) {
    throw new Error("offline-stack: FERA_DEMO_DB_NAME is required");
  }
  if (name.length > DEMO_DB_PREFIX.length + DEMO_DB_MAX_SUFFIX) {
    throw new Error(`offline-stack: database name too long (>${DEMO_DB_PREFIX.length + DEMO_DB_MAX_SUFFIX})`);
  }
  if (!name.startsWith(DEMO_DB_PREFIX)) {
    throw new Error(`offline-stack refuses non-owned database ${name}; this lane owns ${DEMO_DB_PREFIX}* only`);
  }
  const suffix = name.slice(DEMO_DB_PREFIX.length);
  if (!/^[a-z0-9_]{1,32}$/.test(suffix)) {
    throw new Error(`offline-stack: database name must match ${DEMO_DB_PREFIX}[a-z0-9_]{1,32}`);
  }
  return name;
}

export function withDemoDatabase(url, name) {
  const out = new URL(url.href);
  out.pathname = `/${assertDemoDatabaseName(name)}`;
  return out;
}

// `withPath` swaps the URL path WITHOUT validating it as a demo DB
// name. Used to point the maintenance connection at the server's
// `postgres` DB. The host is still guarded by `assertLoopbackUrl`.
export function withPath(url, dbName) {
  if (typeof dbName !== "string" || dbName.length === 0) {
    throw new Error("offline-stack: withPath requires a non-empty name");
  }
  const out = new URL(url.href);
  out.pathname = `/${dbName}`;
  return out;
}

// ---- URL masking ---------------------------------------------------------
// `maskUrl` returns the URL with the password swapped for `***` so it
// is safe to print in JSON output, provenance, and the `next` array.
export function maskUrl(url) {
  const href = typeof url === "string" ? url : url?.href ?? "";
  // Match the password segment of a postgresql(s) URL authority.
  // postgres://user:password@host:port/db
  return href.replace(/(postgres(?:ql)?:\/\/[^:@/]+:)([^@]+)(@)/, (_m, head, _pw, tail) => `${head}***${tail}`);
}

// ---- Error sanitization --------------------------------------------------
// Strip any password-bearing authority, any URL, and any payload that
// could leak case data out of an error message before it reaches the
// operator.
const URL_LIKE = /(?:postgres(?:ql)?:\/\/)[^\s)]+/gi;
const PHONE_LIKE = /\b01\d{9,10}\b/g;
const CHILD_LIKE = /(?:child|kids?|baby|missing\s*report|seed\s*text)/gi;
const NAKED_DB = new RegExp(`(?:^|\\W)(fera_demo_premain_[a-z0-9_]+)`, "gi");

export function sanitizeError(err) {
  const raw = err instanceof Error ? err.message : String(err);
  const code = err && typeof err === "object" && "code" in err ? String(err.code) : null;
  let out = raw
    .replace(URL_LIKE, "<url>")
    .replace(NAKED_DB, (_m, name) => `<demo-db:${name.slice(DEMO_DB_PREFIX.length)}>`)
    .replace(PHONE_LIKE, "<phone>")
    .replace(CHILD_LIKE, "<child>");
  if (out.length > 400) out = `${out.slice(0, 380)}…`;
  return `Fera offline-stack: ${out}${code ? ` (code ${code})` : ""}`;
}

// ---- State / keys path guard --------------------------------------------
// The state file (and the keys file, see app.mjs) live under
// <worktree>/.demo/. The helper below is the single source of truth
// for "is this path under the worktree-owned .demo/ directory?".
// It anchors the check on the worktree root passed in by the CLI so
// the helper can refuse a path under someone else's repo, .env*,
// db/, or src/.
//
// Canonicalisation: the path is resolved (absolute) AND symlink-canonicalised
// (realpath) BEFORE the comparison, so a symlink that escapes `.demo/`
// cannot pass the guard. If the parent path is not yet present (e.g. the
// `.demo/` directory does not exist on a fresh worktree), the realpath of
// the *worktree root* is used as the canonicalisation anchor and the
// candidate state file path is compared against the canonical join.
//
// `assertDemoPath` is the lower-level helper: given a worktree root
// and a relative path under `.demo/`, it returns the canonical
// absolute path or throws. `assertStatePath` is a thin wrapper for
// the state file. The launcher (`app.mjs`) calls `assertDemoPath`
// directly with `keys.json` so the keys file benefits from the same
// symlink / escape guard without needing a second copy of the
// function.
function assertDemoPath(rawPath, worktreeRoot, relativeName) {
  if (typeof rawPath !== "string" || rawPath.length === 0) {
    throw new Error("offline-stack: state path is required");
  }
  const root = resolve(worktreeRoot ?? process.cwd());
  let realRoot;
  try {
    realRoot = realpathSync(root);
  } catch {
    realRoot = root;
  }
  for (const candidate of [resolve(realRoot, ".demo"), resolve(rawPath)]) {
    try { if (lstatSync(candidate).isSymbolicLink()) throw new Error("offline-stack: refuses symlink state path"); }
    catch (err) { if (err.code !== "ENOENT") throw err; }
  }
  const allowed = resolve(realRoot, ".demo", relativeName);
  // Refuse any path whose parent is not the worktree-owned .demo/
  // (canonical). The parent-realpath check catches symlink escapes
  // even before the candidate file exists.
  let parentReal;
  try {
    parentReal = realpathSync(resolve(rawPath, ".."));
  } catch {
    parentReal = resolve(rawPath, "..");
  }
  const allowedParent = resolve(realRoot, ".demo");
  if (parentReal !== allowedParent) {
    throw new Error(`offline-stack refuses state path outside the worktree-owned .demo/ (got ${rawPath}, parent ${parentReal}, expected parent ${allowedParent})`);
  }
  // If the candidate file exists, its realpath must equal the
  // canonical allowed path. If the file does not exist yet (fresh
  // worktree), the absolute resolved path of the candidate is
  // compared; the parent check above already gated the parent.
  let resolved;
  try {
    resolved = realpathSync(rawPath);
  } catch {
    resolved = resolve(rawPath);
  }
  if (resolved !== allowed) {
    throw new Error(`offline-stack refuses state path outside the worktree-owned .demo/ (got ${rawPath}, resolved ${resolved}, expected ${allowed})`);
  }
  return allowed;
}

export function assertProvenancePath(rawPath, worktreeRoot) {
  return assertDemoPath(rawPath, worktreeRoot, "provenance.md");
}

export function assertStatePath(rawPath, worktreeRoot) {
  return assertDemoPath(rawPath, worktreeRoot, "state.json");
}

// `assertKeysPath` is the keys-file counterpart: the launcher
// reuses the same symlink / canonicalisation rules so a foreign
// worktree's .demo/ cannot be used to satisfy this lane's keys
// file.
export function assertKeysPath(rawPath, worktreeRoot) {
  return assertDemoPath(rawPath, worktreeRoot, "keys.json");
}

// ---- Command result helpers ---------------------------------------------
// `ok()` is the one place that decides whether a command succeeded. It
// exists so the CLI never re-implements exit-code rules. The CLI uses
// it on every command's result and exits non-zero on `ok===false`.
export function ok(value) {
  return value === true;
}

// ---- CLI parser ----------------------------------------------------------
// We intentionally never echo the value of an unknown command (it
// could be a positional credential).
export function parseCli(argv) {
  const args = argv.slice(2);
  const out = { cmd: undefined, flags: {}, errors: [] };
  if (args.length === 0) {
    out.errors.push("missing command");
    return out;
  }
  const [head, ...rest] = args;
  if (head === "--help" || head === "-h") {
    out.help = true;
    return out;
  }
  if (!["start", "status", "stop", "reset", "verify"].includes(head)) {
    out.errors.push("unknown command");
    return out;
  }
  out.cmd = head;
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === "--yes") {
      out.flags.yes = true;
    } else if (a === "--reuse") {
      out.flags.reuse = true;
    } else if (a === "--no-network") {
      out.flags.noNetwork = true;
    } else if (a === "--fresh") {
      // Documented but kept as alias of "ensure fresh DB". The script
      // interprets --fresh as a one-time hint that the operator wants a
      // new worktree-scoped DB even if a state file exists. The CLI
      // itself never drops data on this hint; the operator still has
      // to invoke `reset --yes` for destructive teardown.
      out.flags.fresh = true;
    } else if (a === "--json") {
      out.flags.json = true;
    } else {
      out.errors.push("unknown flag");
    }
  }
  if (out.cmd === "reset" && out.flags.yes !== true) {
    out.errors.push("reset requires --yes");
  }
  return out;
}

// ---- App start instructions ---------------------------------------------
// Build the `next` array the CLI prints to stdout for the operator to
// copy-paste. The previous version emitted masked passwords and
// `<throwaway-set-by-start>` placeholders that were NOT
// copy-pasteable. The new contract:
//
//   * URLs are ALWAYS masked (no password leakage).
//   * Passwords are NEVER invented; the operator gets a copy-pasteable
//     command that the dedicated `app.mjs` launcher understands, and
//     the launcher reads the synthetic seed passwords from the env it
//     already exposes.
//   * The launcher command is a single line the operator can paste:
//
//       npm run build && node scripts/demo/app.mjs
//
//     This is the documented `start → app helper` chain.
export function nextSteps({ adminUrl, dbName, appUrl, appPort, cacheDir, withStart }) {
  const maskedAdmin = maskUrl(adminUrl);
  const maskedApp = maskUrl(appUrl);
  // `app.mjs` is the single source of truth for the dedicated app
  // process. The CLI never re-implements that here; it only tells
  // the operator what to copy-paste. The launcher itself owns the
  // env, the keys, and the binding — see scripts/demo/app.mjs.
  const out = [
    `# Dedicated app launcher (the launcher sets DEMO_MODE=1, NEXT_TELEMETRY_DISABLED=1,`,
    `# FERA_MODEL_CACHE, DATABASE_URL on the dedicated DB at 127.0.0.1:${3215},`,
    `# and binds 127.0.0.1:${appPort}; the operator does NOT need to copy env vars).`,
    `npm run build && node scripts/demo/app.mjs`,
    ``,
    `# Environment for the operator's own shell (already set by the launcher):`,
    `#   DATABASE_URL='${maskedApp}'`,
    `#   FERA_DB_ADMIN_URL='${maskedAdmin}'`,
    `#   FERA_DB_NAME='${dbName}'`,
    `#   FERA_MODEL_CACHE='${cacheDir}'`,
    `#   DEMO_MODE=1`,
    `#   PORT='${appPort}'`,
  ];
  if (withStart) out.push("# app launch requested; the launcher is the source of truth, see 'started: true' in the JSON above");
  return out;
}
