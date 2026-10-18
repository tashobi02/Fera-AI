// Offline stack `verify` (TASK-053, revised).
//
// Read-only check that the offline stack is ready to run. Audits the
// model cache, computes the db script hashes, and probes the
// container + DB so `verifyOverall:false` actually means "something
// is wrong". The previous version always exited 0 and reported
// `overall:false` even when the cache audit returned `missing` —
// a silent failure. The new version exits non-zero on any failed
// step so a CI / rehearsal harness can detect a bad run.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { sanitizeError, DEMO_PORT, DEMO_APP_PORT, containerNameFor, withDemoDatabase, assertLoopbackUrl } from "./lib/guard.mjs";
import { auditCache, defaultCacheDir } from "./lib/cache.mjs";
import { inspectContainer, waitForReady } from "./lib/docker.mjs";
import { loadState } from "./lib/state.mjs";
import { PINS } from "./lib/pins.mjs";
import { spawnSync } from "node:child_process";

function resolveWorktree() {
  return process.cwd();
}

function sha256(path) {
  const h = createHash("sha256");
  h.update(readFileSync(path));
  return h.digest("hex");
}

async function checkDbScripts() {
  const out = [];
  for (const pin of PINS.dbScripts) {
    const full = join(resolveWorktree(), pin.path);
    try {
      const actual = sha256(full);
      // For the dynamic script pins, the literal sha256 is "" (we do
      // not want to hardcode it because those scripts change
      // frequently). We only assert the file is present and the
      // sha256 is computed, not that it matches a fixed value.
      if (pin.sha256 && actual !== pin.sha256) {
        out.push({ path: pin.path, ok: false, expected: pin.sha256, actual });
      } else {
        out.push({ path: pin.path, ok: true, sha256: actual });
      }
    } catch (err) {
      out.push({ path: pin.path, ok: false, error: sanitizeError(err) });
    }
  }
  return out;
}

async function probeDbReadiness(database) {
  const target = withDemoDatabase(assertLoopbackUrl("postgresql://postgres:postgres@127.0.0.1:3215/postgres"), database);
  const r = spawnSync("psql", [target.href, "-X", "-q", "-At", "-c", "SELECT 1"], {
    encoding: "utf8",
    env: { ...process.env, PGCONNECT_TIMEOUT: "3" },
    timeout: 5000,
  });
  return { ok: r.status === 0 && /1/.test(r.stdout), stderr: r.status === 0 ? null : r.stderr };
}

export async function verify() {
  const worktree = resolveWorktree();
  const cache = await auditCache(defaultCacheDir());
  const state = loadState({ worktreeRoot: worktree });
  const container = await inspectContainer(worktree);
  const dbScripts = await checkDbScripts();
  const ready = state && container && !container.foreign && container.status === "running" ? await waitForReady(worktree, 5_000) : { ok: false, reason: "container not running" };
  const dbReady = ready.ok ? await probeDbReadiness(state.database) : { ok: false, reason: ready.reason };
  const overall = cache.status === "ok" && dbScripts.every((s) => s.ok) && ready.ok && dbReady.ok;
  return {
    ok: overall,
    overall,
    verifyOverall: overall,
    worktree,
    port: DEMO_PORT,
    appPort: DEMO_APP_PORT,
    container: { name: container?.name ?? containerNameFor(worktree), status: container?.status ?? "missing", foreign: container?.foreign === true },
    db: ready,
    dbQuery: dbReady,
    cache,
    dbScripts,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  verify()
    .then((r) => {
      console.log(JSON.stringify(r, null, 2));
      process.exit(r.overall ? 0 : 1);
    })
    .catch((err) => {
      console.error(sanitizeError(err));
      process.exit(1);
    });
}
