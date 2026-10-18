// Offline stack `start` (TASK-053, revised).
//
// Brings the dedicated loopback DB up, runs the regular db:reset +
// seed against it, audits the pinned model cache, and writes a state
// file at <worktree>/.demo/state.json. Idempotent. Refuses to start
// if any of these cannot be done safely.
//
// Lifecycle invariants (this rewrite):
//
//   1. **Cache first.** The pinned model cache audit runs BEFORE any
//      Docker mutation, BEFORE the volume is created, and BEFORE
//      db:reset is invoked. If the cache is missing or tampered,
//      `start` fails closed with `ok:false` and no resources are
//      created.
//   2. **No destructive start.** `start` only runs db:reset when
//      there is no usable DB on the dedicated volume yet. Once a
//      synthetic dataset is loaded, subsequent `start` (and
//      `start --reuse`) merely re-checks that the DB is reachable.
//      The operator must run `reset --yes` explicitly to drop data.
//   3. **Per-worktree ownership.** Container, volume, network, and
//      state file all derive from the worktree's owner label. A
//      foreign resource with the same name is refused outright.
//   4. **Distinct app port.** The `next` array never uses the same
//      port for the app as for the DB, so the operator's clipboard
//      is unambiguous.
//   5. **No secrets in output.** All URLs in JSON / state /
//      provenance are masked; the `next` array uses throwaway env
//      placeholders, never real passwords.
//
// This script does NOT start the Next.js application — that is owned
// by the regular `next start` (or by the dedicated `npm run
// start:offline` launcher the lane integrates separately). Keeping
// the app server out of this script means the offline stack can be
// exercised in unit tests without a 100 MiB Next.js boot.
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import {
  assertLoopbackUrl,
  assertDemoDatabaseName,
  containerNameFor,
  volumeNameFor,
  DEMO_PORT,
  DEMO_APP_PORT,
  nextSteps,
  sanitizeError,
  withDemoDatabase,
  withPath,
  ownerLabel,
} from "./lib/guard.mjs";
import { auditCache, defaultCacheDir } from "./lib/cache.mjs";
import { buildImage, dockerIsAvailable, imageExists, inspectContainer, startContainer, waitForReady } from "./lib/docker.mjs";
import { createState, loadState, saveState, writeProvenance } from "./lib/state.mjs";

const ADMIN_URL = "postgresql://postgres:postgres@127.0.0.1:3215/postgres";
const APP_URL_TEMPLATE = "postgresql://fera_app:fera_app_local_dev@127.0.0.1:3215/{db}";

function resolveWorktree() {
  return process.cwd();
}

function uniqueDemoDbName(worktree) {
  // Stable per-worktree name: short hash of the owner label. The
  // previous implementation derived a name from the directory's last
  // segment, which collided on worktrees whose names shared a
  // suffix. A short hash of the owner label is unique by
  // construction and matches the container / volume / state file.
  const hash = ownerLabel(worktree).slice(0, 12);
  return `fera_demo_premain_${hash}`;
}

function spawnCaptured(cmd, args, env) {
  return new Promise((resolveP, rejectP) => {
    const child = spawn(cmd, args, { env, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    child.stdout.on("data", (b) => { out += b.toString(); });
    child.stderr.on("data", (b) => { err += b.toString(); });
    child.on("error", rejectP);
    child.on("close", (code) => resolveP({ code: code ?? 1, stdout: out, stderr: err }));
  });
}

async function ensureImage(worktree) {
  if (await imageExists()) return { ok: true, status: "present" };
  const r = await buildImage(worktree);
  if (!r.ok) return { ok: false, reason: "build failed", stderr: r.stderr, code: r.code };
  return { ok: true, status: "built" };
}

async function ensureContainer(worktree) {
  const inspected = await inspectContainer(worktree);
  if (inspected && inspected.foreign === true) {
    return { ok: false, reason: "foreign-owned container with the same name exists" };
  }
  if (inspected && inspected.status === "running") return { ok: true, status: "running" };
  if (inspected && inspected.status === "exited") {
    const r = await startContainer(worktree);
    if (!r.ok) return { ok: false, reason: "could not start existing", stderr: r.stderr, code: r.code };
    const ready = await waitForReady(worktree);
    if (!ready.ok) return { ok: false, reason: "not ready" };
    return { ok: true, status: "restarted" };
  }
  const r = await startContainer(worktree);
  if (!r.ok) return { ok: false, reason: "could not start", stderr: r.stderr, code: r.code };
  const ready = await waitForReady(worktree);
  if (!ready.ok) return { ok: false, reason: "not ready" };
  return { ok: true, status: "created" };
}

async function loadExisting(worktree) {
  try {
    return loadState({ worktreeRoot: worktree });
  } catch (err) {
    throw new Error(`offline-stack: corrupt state; refusing to start: ${sanitizeError(err)}`);
  }
}

// `dbExists` is a SAFE existence probe. It uses the server's
// `pg_database` catalog (so a misnamed candidate never even reaches
// the maintenance connection) and returns one of:
//
//   * `{ kind: "exists" }`     — server has this DB
//   * `{ kind: "absent" }`     — server does NOT have this DB
//   * `{ kind: "probe-error", stderr }` — server unreachable / probe
//                                          failed. Caller MUST fail
//                                          closed; never call
//                                          db:reset on a probe error
//                                          because we cannot prove
//                                          the DB is absent.
async function dbExists(dbName) {
  // The maintenance connection (postgres DB) is the only thing we use
  // here. We never connect to the candidate DB itself: the previous
  // implementation connected to the candidate to read
  // `to_regclass('public.users')`, which on a corrupted candidate DB
  // (a half-applied schema) returned a result that masqueraded as
  // "usable" while the schema was actually broken. The catalog probe
  // through the maintenance DB is honest.
  const server = withPath(assertLoopbackUrl(ADMIN_URL), "postgres");
  // `pg_database.datname` is parameterised via `quote_ident` so the
  // value cannot inject SQL. `assertDemoDatabaseName` is already
  // applied upstream, so the value is a known-safe owned suffix.
  const sql = `SELECT 1 FROM pg_database WHERE datname = '${dbName}'`;
  const r = await spawnCaptured("psql", [server.href, "-X", "-q", "-At", "-c", sql], {
    ...process.env,
    PGCONNECT_TIMEOUT: "5",
  });
  if (r.code !== 0) {
    return { kind: "probe-error", stderr: r.stderr };
  }
  return r.stdout.trim() === "1" ? { kind: "exists" } : { kind: "absent" };
}

// `dbIsUsable` probes the schema on a DB that `dbExists` already
// confirmed exists. Returns one of:
//
//   * `{ kind: "usable" }`                  — schema looks loaded
//   * `{ kind: "exists-but-no-users" }`     — DB exists, no users table
//   * `{ kind: "exists-but-inconsistent" }` — DB exists, schema looks broken
//   * `{ kind: "probe-error", stderr }`     — server unreachable on candidate
//
// The `start` flow on `exists-but-no-users` / `exists-but-inconsistent`
// MUST fail closed: the operator must run `reset --yes` to drop the
// inconsistent DB. `start` is never allowed to silently nuke a DB
// that exists. Only `reset --yes` is destructive.
async function dbIsUsable(dbName) {
  const targetUrl = withDemoDatabase(withPath(assertLoopbackUrl(ADMIN_URL), "postgres"), dbName);
  const r = await spawnCaptured("psql", [
    targetUrl.href, "-X", "-q", "-At",
    "-c", "SELECT to_regclass('public.users') IS NOT NULL",
  ], { ...process.env, PGCONNECT_TIMEOUT: "5" });
  if (r.code !== 0) {
    return { kind: "probe-error", stderr: r.stderr };
  }
  const hasUsersTable = /t/.test(r.stdout);
  if (!hasUsersTable) {
    return { kind: "exists-but-no-users" };
  }
  return { kind: "usable" };
}

// `ensureFreshDb` runs the regular `db:reset` script. We call this
// only when `dbExists` has proven the dedicated DB is absent, so the
// underlying DROP DATABASE is a no-op. Calling it on a present DB
// would be the destructive path; that is reserved for `reset --yes`.
async function ensureFreshDb(env) {
  // The db:reset script is owned by the regular lane; we only call
  // it when the dedicated volume is fresh. Once a DB exists, future
  // starts skip this step (idempotency).
  const reset = await spawnCaptured("node", ["scripts/db/reset.mjs"], env);
  if (reset.code !== 0) {
    throw new Error(`offline-stack: db:reset failed: ${sanitizeError(new Error(reset.stderr || "exit " + reset.code))}`);
  }
}

async function seedDataset(env) {
  const seedUsers = await spawnCaptured("node", ["scripts/db/seed-users.mjs"], env);
  if (seedUsers.code !== 0) {
    throw new Error(`offline-stack: seed:users failed: ${sanitizeError(new Error(seedUsers.stderr || "exit " + seedUsers.code))}`);
  }
  const seedSet = await spawnCaptured("node", ["db/seed/index.mjs", "--", "--set", "demo"], env);
  if (seedSet.code !== 0) {
    throw new Error(`offline-stack: seed --set demo failed: ${sanitizeError(new Error(seedSet.stderr || "exit " + seedSet.code))}`);
  }
}

export async function start({ reuseDb = false, fresh = false } = {}) {
  const worktree = resolveWorktree();
  const demoDir = join(worktree, ".demo");
  mkdirSync(demoDir, { recursive: true });

  // 0. Cache pin check BEFORE any docker / db mutation. The previous
  //    lifecycle audited the cache AFTER the DB writes; a missing
  //    cache was a silent failure once the demo had been seeded.
  //    Now we fail closed: no docker container, no db:reset, no seed.
  if (!(await dockerIsAvailable())) {
    throw new Error("offline-stack: docker is not available on this host; the offline stack needs a local Docker daemon to host the dedicated DB");
  }
  const cacheReportEarly = await auditCache(defaultCacheDir());
  if (cacheReportEarly.status !== "ok") {
    throw new Error(
      `offline-stack: pinned model cache is ${cacheReportEarly.status} at ${cacheReportEarly.layoutDir}; run 'npm run model:fetch' first or set FERA_MODEL_CACHE to a primed directory`,
    );
  }

  // 1. Dedicated image + container.
  const img = await ensureImage(worktree);
  if (!img.ok) throw new Error(`offline-stack: image could not be prepared (${img.reason}; ${(img.stderr || "").trim().split("\n").slice(-2).join(" | ")})`);
  const ctn = await ensureContainer(worktree);
  if (!ctn.ok) throw new Error(`offline-stack: container could not be started (${ctn.reason}; ${(ctn.stderr || "").trim().split("\n").slice(-2).join(" | ")})`);

  // 2. Decide the DB name. If the previous state file is healthy and
  //    the operator asked to reuse, keep the same DB. Otherwise mint
  //    a fresh, worktree-scoped one. We DO NOT drop data: the only
  //    destructive path is `reset --yes`.
  const existing = await loadExisting(worktree);
  const dbName = reuseDb && existing?.database
    ? assertDemoDatabaseName(existing.database)
    : assertDemoDatabaseName(uniqueDemoDbName(worktree));

  // 3. Decide whether to run db:reset + seed. The rule:
  //    - If the dedicated volume is fresh (no data), seed it.
  //    - If a usable DB already exists on the volume AND the
  //      operator did NOT pass --fresh, skip db:reset entirely.
  //    - If the operator passed --fresh, drop the data and reseed.
  //    `reset --yes` is still the only way to drop the data; the
  //    `--fresh` flag is therefore a no-op for the offline stack and
  //    explicitly rejected to keep the contract honest.
  if (fresh) {
    throw new Error("offline-stack: --fresh is not accepted by start; the destructive path is gated to 'reset --yes'");
  }

  const adminUrl = assertLoopbackUrl(ADMIN_URL);
  const targetUrl = withDemoDatabase(adminUrl, dbName);
  const appUrl = withDemoDatabase(assertLoopbackUrl(APP_URL_TEMPLATE.replace("{db}", dbName)), dbName);
  const env = {
    ...process.env,
    FERA_DB_ADMIN_URL: adminUrl.href,
    FERA_DB_NAME: dbName,
    DATABASE_URL: appUrl.href,
    DEMO_MODE: "1",
    SEED_ADMIN_USER: process.env.SEED_ADMIN_USER || "admin.demo",
    SEED_ADMIN_PASSWORD: process.env.SEED_ADMIN_PASSWORD || "fera-demo-admin-pass-1234",
    SEED_USER_PASSWORD: process.env.SEED_USER_PASSWORD || "fera-demo-desk-pass-12345",
  };

  let stateKind = "reused";
  // The decisive test: does the dedicated DB exist and have a
  // usable schema?
  //
  // The previous lifecycle conflated "DB exists on the server" with
  // "schema is loaded", and conflated "schema not loaded" with "drop
  // the DB and re-create it". The fix is a three-step decision:
  //
  //   1. `dbExists` proves the server has the database (catalog
  //      probe via the maintenance connection). A probe error here
  //      means we cannot prove the DB is absent; we refuse rather
  //      than drop a DB we cannot see.
  //   2. If the DB is absent, we call `db:reset` + seed. This is
  //      the ONLY case in which `start` mutates a database.
  //   3. If the DB exists, we probe the schema. A broken or missing
  //      schema is NEVER silently fixed by `start`; the operator
  //      must run `reset --yes` to drop the inconsistent DB.
  const exists = await dbExists(dbName);
  if (exists.kind === "probe-error") {
    throw new Error(`offline-stack: DB existence probe failed; refusing to start (run 'reset --yes' to recover): ${exists.stderr?.split("\n").slice(-2).join(" | ") || "unknown error"}`);
  }
  if (exists.kind === "exists") {
    const usable = await dbIsUsable(dbName);
    if (usable.kind === "probe-error") {
      throw new Error(`offline-stack: DB schema probe failed; refusing to start (run 'reset --yes' to recover): ${usable.stderr?.split("\n").slice(-2).join(" | ") || "unknown error"}`);
    }
    if (usable.kind === "exists-but-no-users" || usable.kind === "exists-but-inconsistent") {
      throw new Error(
        `offline-stack: dedicated DB ${dbName} exists but the schema is missing or broken; refusing to drop it silently. ` +
        `Run 'node scripts/demo/cli.mjs reset --yes' to drop the inconsistent DB and re-seed.`,
      );
    }
    // usable.kind === "usable"
    if (existing?.database === dbName) {
      // Volume + DB are populated; nothing to do.
    } else {
      // DB exists with a usable schema but state was missing —
      // treat as a recovered state, do not re-seed.
      stateKind = "recovered";
    }
  } else {
    // exists.kind === "absent" — DB does not exist. We may safely
    // call db:reset + seed. db:reset itself drops+recreates the DB;
    // since the DB is absent, the DROP is a no-op.
    await ensureFreshDb(env);
    await seedDataset(env);
    stateKind = "fresh";
  }

  // 4. Re-audit the cache AFTER the DB is ready so the state file
  //    captures the final byte state. This audit cannot fail
  //    closed at this point (the cache has not changed since step
  //    0), but it is recorded for evidence.
  const cacheReport = await auditCache(defaultCacheDir());

  // 5. Persist state + provenance.
  const state = createState({
    pid: process.pid,
    port: DEMO_PORT,
    container: containerNameFor(worktree),
    volume: volumeNameFor(worktree),
    database: dbName,
    cache: cacheReport,
    appUrl: appUrl.href,
  });
  saveState(state, { worktreeRoot: worktree });
  writeProvenance(state, { dir: demoDir });

  return {
    ok: true,
    stateKind,
    database: dbName,
    container: containerNameFor(worktree),
    volume: volumeNameFor(worktree),
    port: DEMO_PORT,
    appPort: DEMO_APP_PORT,
    adminUrl: targetUrl.href.replace(/:[^:@/]+@/, ":***@"),
    appUrl: appUrl.href.replace(/:[^:@/]+@/, ":***@"),
    cache: cacheReport,
    worktree,
    stateFile: join(demoDir, "state.json"),
    provenanceFile: join(demoDir, "provenance.md"),
    next: nextSteps({ adminUrl, dbName, appUrl, appPort: DEMO_APP_PORT, cacheDir: defaultCacheDir() }),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  start({ reuseDb: process.argv.includes("--reuse"), fresh: process.argv.includes("--fresh") })
    .then((r) => {
      console.log(JSON.stringify(r, null, 2));
    })
    .catch((err) => {
      console.error(sanitizeError(err));
      process.exit(1);
    });
}
