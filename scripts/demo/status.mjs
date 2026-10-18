// Offline stack `status` (TASK-053, revised).
//
// Read-only snapshot. Probes the dedicated container AND the DB so
// `db.ok` reflects an actual pg_isready response (not just container
// existence). The previous version reported "db ok" whenever the
// container was up, which was a lie on freshly-started containers
// where the daemon has not yet finished init.
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  assertLoopbackUrl,
  containerNameFor,
  volumeNameFor,
  DEMO_PORT,
  DEMO_APP_PORT,
  maskUrl,
  withDemoDatabase,
} from "./lib/guard.mjs";
import { inspectContainer, inspectVolume, waitForReady } from "./lib/docker.mjs";
import { loadState } from "./lib/state.mjs";
import { cacheLayoutExists, defaultCacheDir } from "./lib/cache.mjs";
import { spawnSync } from "node:child_process";

function resolveWorktree() {
  return process.cwd();
}

async function probeDb(dbName) {
  if (!dbName) return { ok: false, reason: "no state file" };
  const adminUrl = assertLoopbackUrl("postgresql://postgres:postgres@127.0.0.1:3215/postgres");
  const targetUrl = withDemoDatabase(adminUrl, dbName);
  const r = spawnSync("psql", [targetUrl.href, "-X", "-q", "-At", "-c", "SELECT 1"], { encoding: "utf8", env: { ...process.env, PGCONNECT_TIMEOUT: "3" }, timeout: 5000 });
  if (r.status !== 0) return { ok: false, reason: r.stderr?.split("\n").at(-1)?.trim() ?? "psql exit " + r.status };
  return { ok: /1/.test(r.stdout), database: dbName };
}

export async function status() {
  const worktree = resolveWorktree();
  const ctn = await inspectContainer(worktree);
  const vol = await inspectVolume(worktree);
  const state = (() => {
    try { return loadState({ worktreeRoot: worktree }); } catch { return null; }
  })();
  const cacheLayout = cacheLayoutExists(defaultCacheDir());
  const adminUrl = assertLoopbackUrl("postgresql://postgres:postgres@127.0.0.1:3215/postgres");

  // Real readiness: actual pg_isready, not just "container exists".
  let ready = { ok: false, reason: "no state file" };
  if (ctn && !ctn.foreign && ctn.status === "running") {
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
    ok: ready.ok && ctn?.foreign !== true,
    worktree,
    owner: state?.owner ?? null,
    container: {
      name: containerNameFor(worktree),
      status: ctn?.status ?? "missing",
      foreign: ctn?.foreign === true,
    },
    volume: vol ?? null,
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
    next: ready.ok
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

if (import.meta.url === `file://${process.argv[1]}`) {
  status()
    .then((r) => {
      console.log(JSON.stringify(r, null, 2));
      process.exit(r.db?.ok === true ? 0 : 1);
    })
    .catch((err) => {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    });
}
