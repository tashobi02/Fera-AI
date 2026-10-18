// Offline stack `stop` (TASK-053, revised).
//
// Stops the dedicated container AND keeps the volume + state file. The
// previous `stop` removed the state file and the volume could not be
// recovered; this rewrite preserves both so a follow-up `start
// --reuse` reattaches the same DB without re-seeding.
//
// To wipe both the volume and the data, run `reset --yes`.
//
// A corrupt state file is reported as a hard failure WITHOUT
// deleting it: the operator gets to see why the run refused. The
// previous behaviour silently swallowed the load error and treated
// the run as "no state"; that lost audit-grade evidence when a
// prior run crashed mid-write.
import { join } from "node:path";
import { sanitizeError } from "./lib/guard.mjs";
import { inspectContainer, inspectVolume, stopContainerKeepVolume } from "./lib/docker.mjs";
import { loadState, saveState, writeProvenance } from "./lib/state.mjs";

function resolveWorktree() {
  return process.cwd();
}

export async function stop() {
  const worktree = resolveWorktree();
  // Fail closed on a corrupt state file: do not silently drop the
  // state, do not proceed with container / volume inspection until
  // the operator sees the corruption.
  let state = null;
  let stateLoadError = null;
  try {
    state = loadState({ worktreeRoot: worktree });
  } catch (err) {
    stateLoadError = sanitizeError(err);
  }

  const inspected = await inspectContainer(worktree);
  let containerResult;
  if (stateLoadError) {
    return {
      ok: false,
      worktree,
      stateRetained: true,
      stateFile: join(worktree, ".demo", "state.json"),
      container: { status: "skipped", reason: "state file corrupt; refusing to mutate anything" },
      volume: null,
      previous: null,
      steps: [{ step: "load-state", ok: false, reason: stateLoadError }],
      next: [
        "the state file is corrupt and was preserved; inspect it before retrying",
        "to wipe it explicitly: node scripts/demo/cli.mjs reset --yes",
      ],
    };
  }
  if (inspected && inspected.foreign === true) {
    containerResult = { ok: false, status: "foreign", stderr: "offline-stack: foreign-owned container with the same name exists; refusing to operate on it" };
  } else if (!inspected) {
    containerResult = { ok: true, status: "missing" };
  } else {
    const r = await stopContainerKeepVolume(worktree);
    containerResult = { ok: r.ok, status: r.ok ? r.status : "stop failed", stderr: r.ok ? null : r.stderr };
  }

  // Inspect the volume to confirm the data is intact for next start.
  const volume = await inspectVolume(worktree);

  // Persist (or update) state. The state file is intentionally kept
  // so `start --reuse` reattaches the same DB.
  let savedStatePath = null;
  if (state) {
    // Refresh the `startedAt` and update container/volume status.
    const updated = { ...state, containerStatus: containerResult.status, volume: volume?.name ?? state.volume, stoppedAt: new Date().toISOString() };
    savedStatePath = saveState(updated, { worktreeRoot: worktree });
    writeProvenance(updated, { dir: join(worktree, ".demo") });
  }

  return {
    ok: containerResult.ok,
    worktree,
    stateRetained: Boolean(state),
    stateFile: state ? join(worktree, ".demo", "state.json") : null,
    savedStatePath,
    container: containerResult,
    volume: volume ?? null,
    previous: state ? { database: state.database, startedAt: state.startedAt } : null,
    next: [
      "data persisted; bring the dedicated DB back with `start --reuse`",
      "to wipe data: node scripts/demo/cli.mjs reset --yes",
    ],
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  stop()
    .then((r) => {
      console.log(JSON.stringify(r, null, 2));
      process.exit(r.ok ? 0 : 1);
    })
    .catch((err) => {
      console.error(sanitizeError(err));
      process.exit(1);
    });
}
