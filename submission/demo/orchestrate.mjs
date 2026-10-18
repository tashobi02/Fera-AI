// submission/demo/orchestrate.mjs
//
// Phase 4 demo orchestrator. Replaces the awkward "playwright test with a
// stub config" path with a direct lifecycle: reset DB → boot server → run
// capture.mjs → kill server → post-process.
//
// Why not use playwright's webServer: the spec dir for tests/e2e/ is part
// of the build, so any sibling config inherits it. Starting the server
// manually with FERA_E2E_LOG_PATH set and the same env as the e2e wrapper
// is more honest and easier to debug.
//
// All secrets are generated locally; no env files are read.

import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_DATABASE_URL,
  assertLocalDatabaseUrl,
} from "../../scripts/db/guard.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");

const PORT = Number(process.env.FERA_E2E_PORT ?? 3115);
const RAW_DIR = process.env.FERA_DEMO_CAPTURE_DIR ?? join(ROOT, "submission", "demo", "raw");
mkdirSync(RAW_DIR, { recursive: true });

// ---- 1) Build a per-run DB name and log path ------------------------------

const E2E_DB_NAME =
  process.env.FERA_E2E_DB_NAME ??
  `fera_e2e_demo_${process.pid}_${randomBytes(4).toString("hex")}`;
if (!/^fera_e2e_demo_[a-z0-9_]{1,40}$/.test(E2E_DB_NAME)) {
  throw new Error("demo capture requires a dedicated fera_e2e_demo_ database");
}
const E2E_LOG_PATH =
  process.env.FERA_E2E_LOG_PATH ??
  join(ROOT, ".e2e-logs", `fera_e2e_demo_${process.pid}_${randomBytes(4).toString("hex")}.log`);
mkdirSync(dirname(E2E_LOG_PATH), { recursive: true });

const adminUrl = assertLocalDatabaseUrl(
  process.env.FERA_DB_ADMIN_URL ?? DEFAULT_DATABASE_URL,
  "demo:admin",
);
const E2E_DATABASE_URL = `postgresql://fera_app:fera_app_local_dev@${adminUrl.hostname}:${adminUrl.port}/${E2E_DB_NAME}`;

const MODEL_CACHE =
  process.env.FERA_MODEL_CACHE ??
  join(ROOT, ".cache", "models");

const env = {
  ...process.env,
  FERA_E2E: "1",
  FERA_E2E_DB_NAME: E2E_DB_NAME,
  FERA_E2E_DATABASE_URL: E2E_DATABASE_URL,
  FERA_E2E_PORT: String(PORT),
  FERA_E2E_LOG_PATH: E2E_LOG_PATH,
  FERA_DB_NAME: E2E_DB_NAME,
  DATABASE_URL: E2E_DATABASE_URL,
  AUTH_SECRET: randomBytes(32).toString("base64"),
  PARENT_COOKIE_KEY: randomBytes(32).toString("base64"),
  DRAFT_SIGNING_KEY: randomBytes(32).toString("base64"),
  DEMO_MODE: "1",
  FERA_MODEL_CACHE: MODEL_CACHE,
};

console.log(`[demo] loopback DB: ${E2E_DB_NAME}`);
console.log(`[demo] server log: ${E2E_LOG_PATH}`);
console.log(`[demo] model cache: ${MODEL_CACHE}`);

// ---- 2) DB reset -----------------------------------------------------------
console.log("[demo] step 1/4 — reset DB");
await runStep("node scripts/db/reset.mjs", env, ROOT);

// ---- 3) Build --------------------------------------------------------------
console.log("[demo] step 2/4 — build (next build)");
await runStep("npm run build", env, ROOT);

// ---- 4) Start server via e2e-server.mjs wrapper ---------------------------
console.log("[demo] step 3/4 — start server on :${PORT}".replace("${PORT}", String(PORT)));
const server = spawn("node", ["scripts/e2e-server.mjs"], {
  cwd: ROOT,
  env,
  stdio: ["ignore", "inherit", "inherit"],
});
server.on("error", (e) => console.error("[demo] server spawn error", e));

// Wait for / to return.
async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/`);
      if (res.status >= 200 && res.status < 500) return;
    } catch { /* not yet */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("server did not become ready");
}

let captureRc = 0;
try {
  await waitForServer();
  console.log("[demo] server ready");

  // ---- 5) Run the capture ----------------------------------------------------
  console.log("[demo] step 4/4 — capture");
  try {
    await runStep("node submission/demo/capture.mjs", env, ROOT);
  } catch (err) {
    captureRc = err?.rc ?? 1;
    console.error("[demo] capture failed", err);
  }
} catch (err) {
  captureRc = 1;
  console.error("[demo] server failed to become ready", err);
} finally {
  // ---- 6) Stop server (always) ---------------------------------------------
  console.log("[demo] stopping server");
  try { server.kill("SIGTERM"); } catch {}
  await new Promise((r) => setTimeout(r, 2000));
  try { server.kill("SIGKILL"); } catch {}
}

process.exit(captureRc);

function runStep(cmd, env, cwd) {
  return new Promise((resolve, reject) => {
    // Split on the first whitespace only; preserve quoted args.
    const m = /^(\S+)\s+(.*)$/.exec(cmd);
    if (!m) return reject({ rc: 2, cmd });
    const [, bin, rest] = m;
    const args = rest.match(/(?:[^\s"]+|"[^"]*")+/g) ?? [];
    const child = spawn(bin, args, { cwd, env, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolve() : reject({ rc: code, cmd })));
  });
}
