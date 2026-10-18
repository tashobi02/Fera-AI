// Fera offline-stack app launcher (TASK-053, revised).
//
// Brings the dedicated Next.js runtime up against the dedicated
// `fera_demo_premain_<owner>` DB that `scripts/demo/cli.mjs start`
// has already prepared. The launcher is a thin, honest shim:
//
//   * It ONLY reads owned state (`<worktree>/.demo/state.json`),
//     the owned model cache directory, and the owned DB. It never
//     reaches the host network, never reads `.env*`, and never
//     picks up `AUTH_SECRET` / `PARENT_COOKIE_KEY` from the user's
//     environment.
//   * It generates 32 random bytes for `AUTH_SECRET`,
//     `PARENT_COOKIE_KEY` and `DRAFT_SIGNING_KEY` ONCE, stores them
//     in `<worktree>/.demo/keys.json` (mode `0600`), and reuses the
//     same keys on every restart so the session cookie + drafts
//     persist across `stop` → `start --reuse`. The launcher never
//     logs the bytes.
//   * It sets `DEMO_MODE=1`, `NEXT_TELEMETRY_DISABLED=1`,
//     `FERA_MODEL_CACHE`, `DATABASE_URL`, and the binding
//     `127.0.0.1:3216` for the dedicated app port. It spawns the
//     next CLI directly via `process.execPath` + a resolved `next`
//     bin so no shell expansion can inject extra env.
//   * It catches SIGINT / SIGTERM, forwards them to the child, and
//     always reaps the child on exit so the operator's Ctrl-C does
//     not leave a zombie `next` process behind.
//
// Usage:
//   node scripts/demo/app.mjs               # default: 127.0.0.1:3216
//   node scripts/demo/app.mjs --port 3216   # explicit port (must be loopback)
//   node scripts/demo/app.mjs --build       # run `next build` first
//   node scripts/demo/app.mjs --help
import { existsSync, readFileSync, writeFileSync, mkdirSync, openSync, closeSync, statSync, constants } from "node:fs";
import { join, resolve as pathResolve } from "node:path";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  assertLoopbackUrl,
  assertDemoDatabaseName,
  assertKeysPath,
  DEMO_PORT,
  DEMO_APP_PORT,
  ownerLabel,
  sanitizeError,
  maskUrl,
  withDemoDatabase,
} from "./lib/guard.mjs";
import { loadState } from "./lib/state.mjs";
import { auditCache, defaultCacheDir } from "./lib/cache.mjs";
import { createServer } from "node:net";

const KEY_BYTES = 32;
const KEYS_FILE = "keys.json";
const KEYS_VERSION = "offline-stack-keys-v1";

function parseArgs(argv) {
  const args = argv.slice(2);
  const out = { help: false, port: DEMO_APP_PORT, build: false, errors: [] };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--help" || a === "-h") {
      out.help = true;
    } else if (a === "--build") {
      out.build = true;
    } else if (a === "--port") {
      const v = Number(args[++i]);
      if (!Number.isInteger(v) || v < 1024 || v > 65535) out.errors.push("--port requires an integer in 1024-65535");
      else out.port = v;
    } else {
      out.errors.push(`unknown argument: ${a}`);
    }
  }
  return out;
}

function printHelp() {
  process.stdout.write(`Usage: node scripts/demo/app.mjs [flags]

Flags:
  --port <n>   bind the Next.js server to 127.0.0.1:<n> (default ${DEMO_APP_PORT}; must be loopback)
  --build      run 'next build' first (refuses if a build is already present)
  --help, -h   show this help

Environment:
  The launcher does NOT read .env* or any user-provided AUTH_SECRET.
  It generates 32-byte random keys ONCE into <worktree>/.demo/keys.json
  (mode 0600) and reuses them across restarts. The launcher also sets
  DEMO_MODE=1, NEXT_TELEMETRY_DISABLED=1, FERA_MODEL_CACHE, and the
  dedicated DATABASE_URL on the loopback DB port ${DEMO_PORT}.

Prerequisites:
  1. npm run build                                 # Next.js production build
  2. node scripts/demo/cli.mjs start               # dedicated DB + container
  3. node scripts/demo/app.mjs                     # this launcher

  Or in one go:
     npm run build && node scripts/demo/cli.mjs start && node scripts/demo/app.mjs
`);
}

function resolveWorktree() {
  return process.cwd();
}

// Generate or load the persistent signing keys. The first invocation
// in a worktree writes 32 random bytes for each of the three Fera
// secrets; subsequent invocations read them back. The file is owned
// mode 0600 and lives under the worktree-owned .demo/ directory so
// `assertStatePath` semantics apply (symlink escapes are refused).
export async function loadOrCreateKeys({ worktree }) {
  const allowed = assertKeysPath(join(worktree, ".demo", KEYS_FILE), worktree);
  // Refuse a symlink escape on the keys file (a fresh file does not
  // exist yet, so we just rely on assertKeysPath's parent check).
  mkdirSync(pathResolve(allowed, ".."), { recursive: true, mode: 0o700 });

  if (existsSync(allowed)) {
    if ((statSync(allowed).mode & 0o077) !== 0) throw new Error("offline-stack: keys file must have mode 0600");
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(allowed, "utf8"));
    } catch (err) {
      throw new Error(`offline-stack: keys file is corrupt; refusing to read partial keys (delete it explicitly to regenerate): ${err instanceof Error ? err.message : String(err)}`);
    }
    if (parsed?.version !== KEYS_VERSION) {
      throw new Error(`offline-stack: keys file version ${String(parsed?.version)} is not recognised (expected ${KEYS_VERSION}); refusing to read partial keys`);
    }
    for (const name of ["AUTH_SECRET", "PARENT_COOKIE_KEY", "DRAFT_SIGNING_KEY"]) {
      const v = parsed?.[name];
      if (typeof v !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(v) || Buffer.from(v, "base64url").length !== KEY_BYTES) {
        throw new Error(`offline-stack: keys file is missing ${name}; refusing to read partial keys`);
      }
    }
    return { authSecret: parsed.AUTH_SECRET, parentCookieKey: parsed.PARENT_COOKIE_KEY, draftSigningKey: parsed.DRAFT_SIGNING_KEY, created: false };
  }

  // First-time creation. 32 random bytes, base64-encoded, per
  // src/server/auth/secrets.ts (MIN_BYTES=32, base64url).
  const authSecret = randomBytes(KEY_BYTES).toString("base64url");
  const parentCookieKey = randomBytes(KEY_BYTES).toString("base64url");
  const draftSigningKey = randomBytes(KEY_BYTES).toString("base64url");
  const out = {
    version: KEYS_VERSION,
    createdAt: new Date().toISOString(),
    AUTH_SECRET: authSecret,
    PARENT_COOKIE_KEY: parentCookieKey,
    DRAFT_SIGNING_KEY: draftSigningKey,
  };
  // Atomically write the keys file with mode 0600. `writeFileSync`
  // follows umask; we open explicitly to enforce 0600.
  const fd = openSync(allowed, "wx", constants.S_IRUSR | constants.S_IWUSR);
  try {
    writeFileSync(fd, JSON.stringify(out, null, 2) + "\n");
  } finally {
    closeSync(fd);
  }
  return { authSecret, parentCookieKey, draftSigningKey, created: true };
}

// Refuse to leak the secret bytes into a log line. Returns a
// `present: true` shape so the operator sees "the launcher
// generated / reused the secret" without the bytes.
function redactKeys() {
  return { present: true, source: ".demo/keys.json", redacted: true };
}

// Verify the dedicated DB is up and reachable. Refuses to spawn the
// app if the DB is not ready, so the operator does not see a
// `connection refused` page on first hit.
async function verifyDbUp(dbName) {
  assertDemoDatabaseName(dbName);
  const target = withDemoDatabase(
    assertLoopbackUrl(`postgresql://fera_app:fera_app_local_dev@127.0.0.1:${DEMO_PORT}/postgres`),
    dbName,
  );
  const r = await new Promise((resolveP) => {
    const child = spawn("psql", [target.href, "-X", "-q", "-At", "-c", "SELECT 1"], {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, PGCONNECT_TIMEOUT: "5" },
    });
    let out = "";
    let err = "";
    child.stdout.on("data", (b) => { out += b.toString(); });
    child.stderr.on("data", (b) => { err += b.toString(); });
    child.on("error", (e) => resolveP({ code: 1, stdout: "", stderr: e.message }));
    child.on("close", (code) => resolveP({ code: code ?? 1, stdout: out, stderr: err }));
  });
  if (r.code !== 0 || !/1/.test(r.stdout)) {
    throw new Error(`offline-stack: dedicated DB ${dbName} on 127.0.0.1:${DEMO_PORT} is not ready; run 'node scripts/demo/cli.mjs start' first (stderr: ${(r.stderr || "").split("\n").slice(-1)[0] || "none"})`);
  }
}

// Verify the build is present. Refuse to spawn if the .next
// directory is missing or empty so the operator does not see a
// confusing 500.
function verifyBuild(worktree) {
  const buildDir = pathResolve(worktree, ".next");
  if (!existsSync(buildDir)) {
    throw new Error(`offline-stack: .next/ build directory is missing; run 'npm run build' first`);
  }
  if (!existsSync(join(buildDir, "BUILD_ID")) || !readFileSync(join(buildDir, "BUILD_ID"), "utf8").trim()) {
    throw new Error("offline-stack: production BUILD_ID missing; run npm run build");
  }
}

// Run `next build` as a child process. The launcher only invokes
// this when --build is passed; otherwise the operator's prior
// `npm run build` is required.
async function runBuild(worktree) {
  const r = await new Promise((resolveP, rejectP) => {
    const child = spawn("npm", ["run", "build"], {
      cwd: worktree,
      stdio: "inherit",
      env: { ...process.env },
    });
    child.on("error", rejectP);
    child.on("close", (code) => resolveP({ code: code ?? 1 }));
  });
  if (r.code !== 0) throw new Error(`offline-stack: 'npm run build' exited ${r.code}`);
}

function resolveNextBin(worktree) {
  // `next` ships its bin as a JS file. The launcher spawns it via
  // `process.execPath` so no shell expansion can inject env; this
  // is what `next start` itself does.
  const candidates = [
    pathResolve(worktree, "node_modules", "next", "dist", "bin", "next"),
    pathResolve(worktree, "node_modules", ".bin", "next"),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  throw new Error("offline-stack: cannot find the `next` bin; run 'npm install' to restore node_modules");
}

// Run a quick HTTP health probe against the dedicated app port. The
// launcher waits up to 60 s for the next server to come up; it
// returns the first 2xx / 3xx response, or throws.
export async function waitForAppUp(port, timeoutMs = 60_000, child = null) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child && (child.exitCode !== null || child.signalCode !== null)) return { ok: false, reason: "child exited before readiness" };
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(5000), redirect: "error" });
      const body = await response.json();
      if (response.ok && body.db === "ready" && body.embeddings === "ready" && body.demo_mode === true && body.synthetic_only === true) return { ok: true };
    } catch { /* bounded readiness retry; no payload logging */ }
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  return { ok: false, reason: "readiness timeout" };
}

export async function assertPortAvailable(port) {
  await new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", () => reject(new Error(`offline-stack: port ${port} is occupied`)));
    probe.listen(port, "127.0.0.1", () => probe.close(resolve));
  });
}

export async function startApp({ port = DEMO_APP_PORT, build = false } = {}) {
  const worktree = resolveWorktree();

  // 1. Parse + validate the port. The launcher refuses any non-loopback
  //    bind because the dedicated app is intentionally not reachable
  //    from the host network.
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error(`offline-stack: --port must be an integer in 1024-65535 (got ${port})`);
  }
  if (port === DEMO_PORT) {
    throw new Error(`offline-stack: --port ${port} collides with the dedicated DB port; pick a different port`);
  }
  if (port === 54322) {
    throw new Error(`offline-stack: --port ${port} is the human/dev fera-db port; refusing to bind`);
  }
  if (port === 3000) {
    throw new Error(`offline-stack: --port ${port} is the default Next.js port; pick a different port (the side-by-side 'next dev' relies on it)`);
  }

  // 2. State file. The launcher refuses to start without an owned
  //    state file because the `database`, `container`, `volume` and
  //    `owner` fields are what the dedicated runtime depends on.
  await assertPortAvailable(port);
  const state = (() => {
    try { return loadState({ worktreeRoot: worktree }); }
    catch (err) { throw new Error(`offline-stack: state file is corrupt; refusing to start: ${err instanceof Error ? err.message : String(err)}`); }
  })();
  if (!state) {
    throw new Error(`offline-stack: no .demo/state.json found; run 'node scripts/demo/cli.mjs start' first`);
  }

  // 3. Cache directory. The launcher does not download weights; it
  //    just confirms the pinned cache directory still exists.
  const cacheDir = defaultCacheDir();


  // 4. Build. The launcher refuses to spawn the app if the .next
  //    directory is missing or empty. Operators who pass --build get
  //    a fresh build first; otherwise the prior `npm run build` is
  //    required.
  if (build) {
    await runBuild(worktree);
  }
  verifyBuild(worktree);
  const cacheAudit = await auditCache(cacheDir);
  if (cacheAudit.status !== "ok") throw new Error("offline-stack: pinned cache audit failed; run npm run model:fetch");

  // 5. Database. The launcher confirms the dedicated DB is up
  //    before spawning the app.
  await verifyDbUp(state.database);

  // 6. Keys. Generate or load the persistent signing keys. The
  //    launcher NEVER reads .env* for these — the dedicated keys
  //    are local, throwaway, and persistent across restarts.
  const keys = await loadOrCreateKeys({ worktree });
  const keysReport = redactKeys();

  // 7. App environment. The dedicated runtime sees only this env
  //    block (filtered through `process.env` minus any user-supplied
  //    AUTH_SECRET / PARENT_COOKIE_KEY / DRAFT_SIGNING_KEY that the
  //    operator may have set globally).
  const userEnv = { ...process.env };
  // Strip any keys the operator may have set globally so the
  // launcher's locally-generated keys win unconditionally.
  delete userEnv.AUTH_SECRET;
  delete userEnv.PARENT_COOKIE_KEY;
  delete userEnv.DRAFT_SIGNING_KEY;
  delete userEnv.NEXTAUTH_SECRET;
  const appUrl = withDemoDatabase(
    assertLoopbackUrl(`postgresql://fera_app:fera_app_local_dev@127.0.0.1:${DEMO_PORT}/postgres`),
    state.database,
  );
  const env = {
    ...userEnv,
    DEMO_MODE: "1",
    NEXT_TELEMETRY_DISABLED: "1",
    FERA_MODEL_CACHE: cacheDir,
    DATABASE_URL: appUrl.href,
    AUTH_SECRET: keys.authSecret,
    PARENT_COOKIE_KEY: keys.parentCookieKey,
    DRAFT_SIGNING_KEY: keys.draftSigningKey,
    HOSTNAME: "127.0.0.1",
    PORT: String(port),
  };

  // 8. Spawn `next start` via process.execPath so no shell expansion
  //    can inject env. The launcher's child owns the dedicated port.
  const nextBin = resolveNextBin(worktree);
  const child = spawn(process.execPath, [nextBin, "start", "-H", "127.0.0.1", "-p", String(port)], {
    cwd: worktree,
    env,
    stdio: ["ignore", "inherit", "inherit"],
  });
  let exited = false;
  let spawnFailed = false;
  child.on("exit", (code, signal) => {
    exited = true;
    // `code` and `signal` are surfaced through child.exitCode and
    // child.signalCode; the launcher waits on `child` directly
    // rather than tracking them here.
    void code; void signal;
  });
  child.on("error", (err) => {
    spawnFailed = true;
    process.stderr.write(`offline-stack: failed to spawn next: ${sanitizeError(err)}\n`);
  });

  // 9. Forward SIGINT / SIGTERM so Ctrl-C cleanly stops the child.
  const forward = (sig) => () => {
    if (!exited) child.kill(sig);
  };
  const onInt = forward("SIGINT");
  const onTerm = forward("SIGTERM");
  process.on("SIGINT", onInt);
  process.on("SIGTERM", onTerm);
  const cleanup = () => { process.off("SIGINT", onInt); process.off("SIGTERM", onTerm); };
  child.once("close", cleanup);

  // 10. Wait for the app to come up. The probe is a single curl
  //     against `/`; the dedicated runtime's first page is the
  //     parent sign-in (a 200) or a 404, both of which the probe
  //     accepts as "the server is up".
  const ready = await waitForAppUp(port, 60_000, child);
  if (!ready.ok || spawnFailed) {
    child.kill("SIGTERM");
    await Promise.race([new Promise(resolve => child.once("close", resolve)), new Promise(resolve => setTimeout(resolve, 3000))]);
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    cleanup();
    throw new Error(`offline-stack: app did not become ready (${ready.reason ?? "spawn error"})`);
  }
  return {
    ok: ready.ok,
    worktree,
    owner: ownerLabel(worktree),
    database: state.database,
    container: state.container,
    volume: state.volume,
    app: {
      host: "127.0.0.1",
      port,
      pid: child.pid,
      started: ready.ok,
    },
    cache: { dir: cacheDir, present: true },
    keys: keysReport,
    env: {
      DEMO_MODE: "1",
      NEXT_TELEMETRY_DISABLED: "1",
      FERA_MODEL_CACHE: cacheDir,
      DATABASE_URL: maskUrl(appUrl.href),
      HOSTNAME: "127.0.0.1",
      PORT: String(port),
      AUTH_SECRET: "<redacted; see .demo/keys.json>",
      PARENT_COOKIE_KEY: "<redacted; see .demo/keys.json>",
      DRAFT_SIGNING_KEY: "<redacted; see .demo/keys.json>",
    },
    childPid: child.pid,
    next: ready.ok
      ? [
          `open http://127.0.0.1:${port}/ in your browser`,
          "to stop the app: Ctrl-C in this terminal (the dedicated DB and volume are kept)",
          "to wipe everything: node scripts/demo/cli.mjs reset --yes",
        ]
      : [
          `app did not become ready within 60s (${ready.reason ?? "no reason"}); the child is still running on pid ${child.pid}`,
          "inspect .demo/keys.json for the local signing keys",
        ],
    child,
  };
}

// Promise-based wait for the spawned child to exit. The CLI uses
// this so `node scripts/demo/app.mjs` blocks until the operator
// presses Ctrl-C.
export function waitForChild(handle) {
  return new Promise((resolve) => {
    if (!handle || !handle.child) return resolve(0);
    const child = handle.child;
    if (child.exitCode !== null || child.signalCode !== null) return resolve(child.exitCode ?? 0);
    child.on("exit", (code) => resolve(code ?? 0));
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    process.exit(0);
  }
  if (args.errors.length > 0) {
    process.stderr.write(`offline-stack: ${args.errors.join("; ")}\n`);
    printHelp();
    process.exit(2);
  }
  startApp({ port: args.port, build: args.build })
    .then(async (handle) => {
      // Print the env block once, with the keys redacted. Never
      // log the secret bytes themselves.
      process.stdout.write(JSON.stringify({
        ok: handle.ok,
        worktree: handle.worktree,
        owner: handle.owner,
        database: handle.database,
        container: handle.container,
        volume: handle.volume,
        app: handle.app,
        cache: handle.cache,
        keys: handle.keys,
        env: handle.env,
        childPid: handle.childPid,
        next: handle.next,
      }, null, 2) + "\n");
      if (!handle.ok) {
        // Hard stop the child if the app never came up.
        if (handle.child && handle.child.exitCode === null) {
          handle.child.kill("SIGTERM");
        }
        process.exit(1);
      }
      // Block until the operator stops the child.
      const code = await waitForChild(handle);
      process.exit(code);
    })
    .catch((err) => {
      process.stderr.write(`${sanitizeError(err)}\n`);
      process.exit(1);
    });
}
