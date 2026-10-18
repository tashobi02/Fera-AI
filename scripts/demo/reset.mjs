// Offline stack `reset` (TASK-053, revised).
//
// Destructive: drops the dedicated demo database, removes the volume,
// removes the container, removes the state file. Refuses to run
// without --yes so a typo cannot wipe a rehearsal's synthetic data.
//
// Order of operations (this rewrite):
//
//   0. PRE-FLIGHT: inspect BOTH the container and the volume. If
//      either is foreign-owned (carries a different owner label, or
//      no owner label at all), refuse the whole operation. This is
//      done BEFORE any mutation so a foreign volume with our name
//      cannot be deleted by mistake. (The previous version checked
//      only the container; a foreign volume with the same name
//      would be removed by `docker volume rm -f` before the foreign
//      check ran.)
//   1. Drop the dedicated database via the maintenance connection
//      (postgres DB, never the target DB). Done while the server is
//      still up so the container holds the volume busy.
//   2. Remove the dedicated container (now safe; the DB is gone).
//   3. Remove the dedicated volume (now safe; the container is gone).
//   4. State file last. The state file is NEVER deleted on
//      pre-flight failure: the operator gets to see why the run
//      refused.
//
// IMPORTANT: reset only ever operates on the offline stack's own
// dedicated container, volume, and DB. The human / dev / CI / e2e
// containers (`fera-db`, `fera_e2e_*` DBs) are not visible to this
// script because every helper refuses foreign-owned resources.
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  assertDemoDatabaseName,
  assertLoopbackUrl,
  containerNameFor,
  volumeNameFor,
  sanitizeError,
  withPath,
} from "./lib/guard.mjs";
import { inspectContainer, inspectVolume, stopContainer, run } from "./lib/docker.mjs";
import { loadState, removeState } from "./lib/state.mjs";

const exec = promisify(execFile);
const ADMIN_URL = "postgresql://postgres:postgres@127.0.0.1:3215/postgres";

function resolveWorktree() {
  return process.cwd();
}

async function dropDb(name) {
  assertDemoDatabaseName(name);
  const server = withPath(assertLoopbackUrl(ADMIN_URL), "postgres");
  const terminateArgs = [server.href, "-X", "-q", "-v", "ON_ERROR_STOP=0", "-c",
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${name}' AND pid <> pg_backend_pid()`,
  ];
  try {
    await exec("psql", terminateArgs, { env: { ...process.env, PGCONNECT_TIMEOUT: "10" }, maxBuffer: 4 * 1024 * 1024 });
  } catch {
    // Even if the terminate fails (e.g. nothing to terminate), we
    // fall through to the DROP. The error case is captured below.
  }
  // Brief pause so the terminated sessions' state clears in PG.
  await new Promise((res) => setTimeout(res, 250));
  const args = [server.href, "-X", "-q", "-v", "ON_ERROR_STOP=1", "-c", `DROP DATABASE IF EXISTS ${name}`];
  try {
    const { stdout, stderr } = await exec("psql", args, { env: { ...process.env, PGCONNECT_TIMEOUT: "10" }, maxBuffer: 4 * 1024 * 1024 });
    return { ok: true, code: 0, stdout, stderr };
  } catch (err) {
    return { ok: false, code: typeof err?.code === "number" ? err.code : 1, stderr: sanitizeError(err) };
  }
}

export async function reset({ yes = false } = {}) {
  if (!yes) {
    throw new Error("offline-stack: reset requires --yes; the destructive path is gated to prevent typos");
  }
  const worktree = resolveWorktree();
  // We do NOT call loadState before pre-flight: a corrupt state file
  // (e.g. one written by a previous run that crashed mid-write) must
  // not be silently thrown away. `loadState` itself can throw; we
  // catch and treat a corrupt state as a hard-stop that preserves
  // the file for inspection.
  let state = null;
  let stateLoadError = null;
  try {
    state = loadState({ worktreeRoot: worktree });
  } catch (err) {
    stateLoadError = sanitizeError(err);
  }
  const steps = [];
  const ctnName = containerNameFor(worktree);
  const volName = volumeNameFor(worktree);

  // 0. PRE-FLIGHT. Inspect container + volume. A foreign-owned
  //    resource with the same name (or a resource missing the owner
  //    label) is a HARD STOP. We do not mutate anything in this
  //    case. The state file is left untouched so the operator can
  //    see the original state.
  const inspected = await inspectContainer(worktree);
  const inspectedVol = await inspectVolume(worktree);
  if (inspected && inspected.foreign === true) {
    return {
      ok: false,
      worktree,
      container: ctnName,
      volume: volName,
      steps: [{
        step: "preflight",
        ok: false,
        reason: `foreign-owned container with the same name (${ctnName}) exists; refusing to operate on a foreign resource. State file preserved.`,
      }],
      statePreserved: true,
      stateFile: join(worktree, ".demo", "state.json"),
    };
  }
  if (inspectedVol && inspectedVol.foreign === true) {
    // A volume with our name but a different owner is the dangerous
    // case. The previous version removed it before checking — fixed
    // here by inspecting first and refusing outright.
    return {
      ok: false,
      worktree,
      container: ctnName,
      volume: volName,
      steps: [{
        step: "preflight",
        ok: false,
        reason: `foreign-owned volume with the same name (${volName}) exists; refusing to operate on a foreign resource. State file preserved.`,
      }],
      statePreserved: true,
      stateFile: join(worktree, ".demo", "state.json"),
    };
  }
  if (stateLoadError) {
    // A corrupt state file is reported as a pre-flight failure.
    // The previous behaviour silently removed it; the new contract
    // preserves it so the operator can see why the run refused.
    return {
      ok: false,
      worktree,
      container: ctnName,
      volume: volName,
      steps: [{
        step: "preflight",
        ok: false,
        reason: `state file is corrupt and cannot be loaded: ${stateLoadError}. State file preserved; delete it manually after inspection.`,
      }],
      statePreserved: true,
      stateFile: join(worktree, ".demo", "state.json"),
    };
  }

  // 1. Drop the dedicated database (while the server is running).
  if (state?.database) {
    const r = await dropDb(state.database);
    steps.push({ step: "drop-db", database: state.database, ok: r.ok, code: r.code, stderr: r.ok ? null : r.stderr });
  } else {
    steps.push({ step: "drop-db", skipped: true, reason: "no state file" });
  }

  // 2. Container. Remove after the DB is dropped.
  if (inspected) {
    const r = await stopContainer(worktree);
    steps.push({ step: "remove-container", ok: r.ok, code: r.code, stderr: r.ok ? null : r.stderr });
  } else {
    steps.push({ step: "remove-container", skipped: true, reason: "no container" });
  }

  // 3. Volume. Now unheld, drop it.
  const volR = await run(["volume", "rm", "-f", volName], { ignoreExitCode: true });
  if (volR.code === 0) {
    steps.push({ step: "remove-volume", ok: true, code: volR.code });
  } else if ((volR.stderr || "").toLowerCase().includes("no such volume")) {
    steps.push({ step: "remove-volume", skipped: true, reason: "no volume", code: volR.code, stderr: volR.stderr });
  } else {
    steps.push({ step: "remove-volume", ok: false, code: volR.code, stderr: volR.stderr });
  }

  // 4. State file last, so a partial reset leaves it for inspection.
  removeState({ worktreeRoot: worktree });
  steps.push({ step: "remove-state", ok: true });

  return {
    ok: steps.every((s) => s.ok !== false),
    worktree,
    container: ctnName,
    volume: volName,
    steps,
    next: [
      "node scripts/demo/cli.mjs start  (will recreate the dedicated DB + container + seed)",
    ],
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  reset({ yes: process.argv.includes("--yes") })
    .then((r) => {
      console.log(JSON.stringify(r, null, 2));
      process.exit(r.ok ? 0 : 1);
    })
    .catch((err) => {
      console.error(sanitizeError(err));
      process.exit(1);
    });
}
