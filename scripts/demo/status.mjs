// Offline stack `status` (TASK-053, revised).
//
// Read-only snapshot. Probes the dedicated container AND the DB so
// `db.ok` reflects an actual pg_isready response (not just container
// existence). The previous version reported "db ok" whenever the
// container was up, which was a lie on freshly-started containers
// where the daemon has not yet finished init.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  assertLoopbackUrl,
  containerNameFor,
  volumeNameFor,
  DEMO_PORT,
  DEMO_APP_PORT,
  maskUrl,
  sanitizeError,
  withDemoDatabase,
} from "./lib/guard.mjs";
import { inspectContainer, inspectVolume, waitForReady } from "./lib/docker.mjs";
import { loadState } from "./lib/state.mjs";
import { cacheLayoutExists, defaultCacheDir } from "./lib/cache.mjs";
import { SEED_COMPLETE_MARKER } from "./lib/guard.mjs";
import { spawnSync } from "node:child_process";

function resolveWorktree() {
  return process.cwd();
}

async function probeDb(dbName) {
  if (!dbName) return { ok: false, reason: "no state file" };
  const adminUrl = assertLoopbackUrl("postgresql://postgres:postgres@127.0.0.1:3215/postgres");
  const targetUrl = withDemoDatabase(adminUrl, dbName);
  // Ready means the seed finished: the seed-complete marker that start
  // stamps last must be present, not just a reachable database.
  const r = spawnSync("psql", [targetUrl.href, "-X", "-q", "-At", "-c", "SELECT coalesce(shobj_description(oid, 'pg_database'), '') FROM pg_database WHERE datname = current_database()"], { encoding: "utf8", env: { ...process.env, PGCONNECT_TIMEOUT: "3" }, timeout: 5000 });
  if (r.status !== 0) return { ok: false, reason: r.stderr?.split("\n").at(-1)?.trim() ?? "psql exit " + r.status };
  if (r.stdout.trim() !== SEED_COMPLETE_MARKER) return { ok: false, reason: "seed-incomplete (run reset --yes, then start)", database: dbName };
  return { ok: true, database: dbName };
}

export async function status() {
  const worktree = resolveWorktree();
  // A failed inspect (daemon down, binary missing, permission denied)
  // is reported as `docker.ok:false`, never as a "missing" resource.
  let ctn = null;
  let vol = null;
  let dockerError = null;
  let stateError = null;
  try {
    ctn = await inspectContainer(worktree);
    vol = await inspectVolume(worktree);
  } catch (err) {
    dockerError = sanitizeError(err);
  }
  const state = (() => {
    try { return loadState({ worktreeRoot: worktree }); } catch (err) { stateError = sanitizeError(err); return null; }
  })();
  const cacheLayout = cacheLayoutExists(defaultCacheDir());
  const adminUrl = assertLoopbackUrl("postgresql://postgres:postgres@127.0.0.1:3215/postgres");

  // Real readiness: actual pg_isready, not just "container exists".
  let ready = { ok: false, reason: stateError ? `state file unreadable: ${stateError}` : "no state file" };
  if (dockerError) {
    ready = { ok: false, reason: "docker unreachable" };
  } else if (ctn && !ctn.foreign && ctn.status === "running") {
    const isReady = await waitForReady(worktree, 5_000);
    if (isReady.ok) {
      ready = await probeDb(state?.database);
    } else {
      ready = { ok: false, reason: "container not ready" };
    }
  } else if (ctn && ctn.foreign === true) {
    ready = { ok: false, reason: "foreign-owned container with the same name" };
  }

  return {
    ok: dockerError === null && ready.ok && ctn?.foreign !== true,
    worktree,
    docker: dockerError ? { ok: false, reason: dockerError } : { ok: true },
    owner: state?.owner ?? null,
    container: {
      name: containerNameFor(worktree),
      status: dockerError ? "unknown" : ctn?.status ?? "missing",
      foreign: ctn?.foreign === true,
    },
    volume: dockerError ? { status: "unknown" } : vol ?? null,
    db: ready,
    cache: cacheLayout,
    stateFile: join(worktree, ".demo", "state.json"),
    stateFileExists: existsSync(join(worktree, ".demo", "state.json")),
    provenanceFile: join(worktree, ".demo", "provenance.md"),
    port: DEMO_PORT,
    appPort: DEMO_APP_PORT,
    database: state?.database ?? null,
    startedAt: state?.startedAt ?? null,
    pid: state?.pid ?? null,
    adminUrl: maskUrl(adminUrl.href),
    next: dockerError
      ? ["docker is unreachable; start the Docker daemon (or fix permissions) and retry status"]
      : ready.ok
      ? [
          "to stop (keep data): node scripts/demo/cli.mjs stop",
          "to wipe data: node scripts/demo/cli.mjs reset --yes",
        ]
      : ctn && ctn.foreign === true
        ? ["offline-stack is BLOCKED: a foreign container with the same name exists. Remove it or rename this worktree."]
        : [
            "not started yet: node scripts/demo/cli.mjs start",
          ],
  };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  status()
    .then((r) => {
      console.log(JSON.stringify(r, null, 2));
      process.exit(r.ok === true ? 0 : 1);
    })
    .catch((err) => {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    });
}
