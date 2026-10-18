// Offline stack `reset` (TASK-053, revised).
//
// Destructive: removes the dedicated container, the dedicated volume
// (and with it every database on it), and the state file. Refuses to
// run without --yes so a typo cannot wipe a rehearsal's synthetic data.
// It sends NO SQL: there is no DROP DATABASE, because a host port may
// by now belong to another stack. Removing the labelled volume is what
// drops the data.
//
// Order of operations:
//
//   0. PRE-FLIGHT: load the state file, inspect BOTH the container
//      and the volume. If either is foreign-owned (a different owner
//      label, or no owner label at all), or the state file is
//      corrupt, refuse the whole operation BEFORE any mutation. If
//      docker itself is unreachable the inspect throws and nothing
//      is mutated either.
//   1. Remove the dedicated container (`docker rm -f`), only if the
//      pre-flight found it with our owner label.
//   2. Remove the dedicated volume (`docker volume rm -f`), only if
//      the pre-flight found it with our owner label.
//   3. State file last, and only when every removal above succeeded;
//      on any failure it is preserved so the operator can see why.
//
// IMPORTANT: reset only ever operates on the offline stack's own
// dedicated container and volume. The human / dev / CI / e2e
// containers (`fera-db`, `fera_e2e_*` DBs) are not visible to this
// script because every helper refuses foreign-owned resources.
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  containerNameFor,
  volumeNameFor,
  sanitizeError,
} from "./lib/guard.mjs";
import { inspectContainer, inspectVolume, stopContainer, run } from "./lib/docker.mjs";
import { loadState, removeState } from "./lib/state.mjs";


function resolveWorktree() {
  return process.cwd();
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

  // Reset uses only exact labelled Docker resources. Never send destructive
  // SQL through a host port which another stack may now occupy.
  // 1. Container (owned, per pre-flight).
  if (inspected) {
    const r = await stopContainer(worktree);
    steps.push({ step: "remove-container", ok: r.ok, code: r.code, stderr: r.ok ? null : r.stderr });
  } else {
    steps.push({ step: "remove-container", skipped: true, reason: "no container" });
  }

  // 2. Volume (owned, per pre-flight). Now unheld, drop it.
  if (!inspectedVol) {
    steps.push({ step: "remove-volume", skipped: true, reason: "no volume" });
  } else {
    const volR = await run(["volume", "rm", "-f", volName], { ignoreExitCode: true });
    if (volR.code === 0) {
      steps.push({ step: "remove-volume", ok: true, code: volR.code });
    } else if ((volR.stderr || "").toLowerCase().includes("no such volume")) {
      steps.push({ step: "remove-volume", skipped: true, reason: "no volume", code: volR.code, stderr: volR.stderr });
    } else {
      steps.push({ step: "remove-volume", ok: false, code: volR.code, stderr: volR.stderr });
    }
  }

  // Preserve recovery state if any required cleanup failed.
  if (steps.some(step => step.ok === false)) {
    return { ok: false, worktree, container: ctnName, volume: volName, steps, statePreserved: true };
  }
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

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
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
