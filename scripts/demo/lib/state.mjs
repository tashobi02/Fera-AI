// State + provenance file helpers (TASK-053, revised).
//
// The offline stack keeps one small JSON file under
// <worktree>/.demo/state.json. It records the pid, port, container,
// volume, network, DB name, model cache audit, and a schema version.
// The provenance.md file is the human-readable equivalent, written
// next to it after every start/reset. Both files live under the
// worktree-owned .demo/ directory; the guard helpers refuse to read
// or write anything else.
//
// Important invariants:
//   * appUrl and any other URL-bearing field are written through
//     `maskUrl` so a printed state file or provenance file never
//     contains a database password.
//   * `port` is the dedicated DB port (3215), NOT the app port
//     (3216). The state file records the DB port so any later
//     `start` call can re-use it; the app port is derived from
//     guard constants and exposed separately in JSON output.
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, openSync, closeSync, constants } from "node:fs";
import { dirname, join } from "node:path";
import {
  assertStatePath,
  assertProvenancePath,
  assertDemoDatabaseName,
  PROVENANCE_SCHEMA_VERSION,
  DEMO_PORT,
  DEMO_APP_PORT,
  containerNameFor,
  volumeNameFor,
  ownerLabel,
  maskUrl,
} from "./guard.mjs";

export function createState({ pid, port, container, volume, database, cache, appUrl }) {
  if (typeof pid !== "number" || !Number.isInteger(pid) || pid <= 0) {
    throw new Error("offline-stack: state.pid must be a positive integer");
  }
  if (port !== DEMO_PORT) {
    throw new Error(`offline-stack: state.port must be ${DEMO_PORT} (got ${port})`);
  }
  if (typeof container !== "string" || container.length === 0) {
    throw new Error("offline-stack: state.container is required");
  }
  if (typeof volume !== "string" || volume.length === 0) {
    throw new Error("offline-stack: state.volume is required");
  }
  assertDemoDatabaseName(database);
  if (!cache || typeof cache !== "object") {
    throw new Error("offline-stack: state.cache is required");
  }
  return {
    schemaVersion: PROVENANCE_SCHEMA_VERSION,
    pid,
    port,
    appPort: DEMO_APP_PORT,
    container,
    volume,
    owner: ownerLabel(process.cwd()),
    database,
    startedAt: new Date().toISOString(),
    cache,
    appUrl: appUrl ? maskUrl(appUrl) : null,
  };
}

export function saveState(state, { statePath, worktreeRoot } = {}) {
  const path = statePath ?? assertStatePath(join(process.cwd(), ".demo", "state.json"), worktreeRoot ?? process.cwd());
  assertStatePath(path, worktreeRoot ?? process.cwd());
  if (state.schemaVersion !== PROVENANCE_SCHEMA_VERSION) {
    throw new Error(`offline-stack: state schemaVersion mismatch (got ${state.schemaVersion}, expected ${PROVENANCE_SCHEMA_VERSION})`);
  }
  mkdirSync(dirname(path), { recursive: true });
  const fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | constants.O_NOFOLLOW, 0o600);
  try { writeFileSync(fd, JSON.stringify(state, null, 2) + "\n", "utf8"); } finally { closeSync(fd); }
  return path;
}

export function loadState({ statePath, worktreeRoot } = {}) {
  const path = statePath ?? assertStatePath(join(process.cwd(), ".demo", "state.json"), worktreeRoot ?? process.cwd());
  assertStatePath(path, worktreeRoot ?? process.cwd());
  if (!existsSync(path)) return null;
  let raw;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    throw new Error(`offline-stack: state file at ${path} is not valid JSON: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (raw.schemaVersion !== PROVENANCE_SCHEMA_VERSION) {
    throw new Error(`offline-stack: state file schema version ${String(raw.schemaVersion)} is not recognised (expected ${PROVENANCE_SCHEMA_VERSION}); delete the state file before retrying`);
  }
  if (typeof raw.container !== "string" || raw.container !== containerNameFor(worktreeRoot ?? process.cwd())) {
    throw new Error(`offline-stack: state file container ${String(raw.container)} is not owned by this worktree (expected ${containerNameFor(worktreeRoot ?? process.cwd())})`);
  }
  if (typeof raw.volume !== "string" || raw.volume !== volumeNameFor(worktreeRoot ?? process.cwd())) {
    throw new Error(`offline-stack: state file volume ${String(raw.volume)} is not owned by this worktree (expected ${volumeNameFor(worktreeRoot ?? process.cwd())})`);
  }
  try {
    assertDemoDatabaseName(raw.database);
  } catch (err) {
    throw new Error(`offline-stack: state file database ${String(raw.database)} is not owned by this lane: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (raw.port !== DEMO_PORT) {
    throw new Error(`offline-stack: state file port ${String(raw.port)} is not ${DEMO_PORT}`);
  }
  return raw;
}

export function removeState({ statePath, worktreeRoot } = {}) {
  const path = statePath ?? assertStatePath(join(process.cwd(), ".demo", "state.json"), worktreeRoot ?? process.cwd());
  if (existsSync(path)) unlinkSync(path);
  return path;
}

// `writeProvenance` writes a human-readable provenance file under the
// worktree-owned .demo/ directory. It never echoes raw URLs with
// passwords; the `state.appUrl` is already masked by `createState`
// but the writer defends in depth by re-masking on output.
export function writeProvenance(state, { dir, worktreeRoot } = {}) {
  const out = dir ?? join(process.cwd(), ".demo");
  const mdPath = assertProvenancePath(join(out, "provenance.md"), worktreeRoot ?? process.cwd());
  mkdirSync(out, { recursive: true });
  const maskedApp = state.appUrl ? maskUrl(state.appUrl) : "n/a";
  const lines = [
    `# Fera offline-stack provenance (${PROVENANCE_SCHEMA_VERSION})`,
    ``,
    `- Started at: ${state.startedAt}`,
    `- Pid: ${state.pid}`,
    `- DB port: ${state.port}`,
    `- App port: ${state.appPort}`,
    `- Owner label: \`${state.owner}\``,
    `- Container: \`${state.container}\``,
    `- Volume: \`${state.volume}\``,
    `- Database: \`${state.database}\``,
    `- App URL: ${maskedApp}`,
    `- Model cache: ${state.cache?.status ?? "unknown"} (${state.cache?.present ?? 0}/${state.cache?.expected?.length ?? 0} files)`,
    ``,
    `## Pinned model files`,
    ``,
    ...((Array.isArray(state.cache?.expected) ? state.cache.expected : []).map((e) => `- \`${e.path}\` — \`${e.sha256}\``)),
    ``,
    `Missing: ${JSON.stringify(state.cache?.missing ?? [])}`,
    `Tampered: ${JSON.stringify(state.cache?.tampered ?? [])}`,
    ``,
    `> Synthetic data only. No real child data, no provider calls, no internet.`,
    `> Generated by scripts/demo/cli.mjs (TASK-053).`,
  ];
  const fd = openSync(mdPath, constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | constants.O_NOFOLLOW, 0o600);
  try { writeFileSync(fd, lines.join("\n") + "\n", "utf8"); } finally { closeSync(fd); }
  return mdPath;
}
