#!/usr/bin/env node
// Fera offline-stack CLI (TASK-053, revised).
//
// Usage:
//   node scripts/demo/cli.mjs start   [--reuse]    # idempotent
//   node scripts/demo/cli.mjs status                # read-only
//   node scripts/demo/cli.mjs stop                  # remove container; keep volume + state
//   node scripts/demo/cli.mjs reset   --yes         # destructive: drop DB, remove volume
//   node scripts/demo/cli.mjs verify                # read-only cache + container + db check
//   node scripts/demo/cli.mjs --help
//
// The CLI never edits package.json, never edits playwright.config,
// never reaches the host network, never fetches model weights, and
// never operates on a resource that does not carry the offline
// stack's owner label.
//
// The `app` helper (scripts/demo/app.mjs) brings the dedicated
// Next.js runtime up against the dedicated DB. It is a separate
// entry point because spawning the full Next.js server is heavy;
// the CLI commands above remain fast to run, fail closed, and easy
// to test in CI.
import { start } from "./start.mjs";
import { status } from "./status.mjs";
import { stop } from "./stop.mjs";
import { reset } from "./reset.mjs";
import { verify } from "./verify.mjs";
import { parseCli, sanitizeError, ok } from "./lib/guard.mjs";

const HELP = `Usage: node scripts/demo/cli.mjs <command> [flags]

Commands:
  start    Bring the dedicated DB + container up, run the pinned
           cache audit FIRST, then db:reset + seed (only when the
           volume is fresh), and write a state file. Idempotent.
           --reuse keeps the previous state file's database.
  status   Read-only: container status, state file, cache layout,
           next steps.
  stop     Remove the dedicated container; keep the volume + state
           so the next start --reuse reattaches the same DB.
  reset    Destructive: remove the container, the volume, drop the
           database, remove the state file. Requires --yes.
  verify   Read-only: pinned cache audit, db script hashes, real
           container + DB readiness. Exits non-zero on any failure.

Flags:
  --reuse       (start)  keep the previous state file's database
  --yes         (reset)  confirm the destructive path
  --json        always JSON output
  --help, -h    show this help

The dedicated container is per-worktree (named
fera-demo-<owner>-pg on 127.0.0.1:3215) and the dedicated database
is fera_demo_premain_<owner>. The dedicated app port for next
start is 3216 (distinct from the DB port 3215). Foreign-owned
resources with the same name are refused outright.
`;

async function main() {
  const parsed = parseCli(process.argv);
  if (parsed.help) {
    process.stdout.write(HELP);
    process.exit(0);
  }
  if (parsed.errors.length > 0 || !parsed.cmd) {
    process.stderr.write(`offline-stack: ${parsed.errors.join("; ") || "missing command"}\n\n${HELP}`);
    process.exit(2);
  }
  let result;
  try {
    switch (parsed.cmd) {
      case "start":
        result = await start({ reuseDb: parsed.flags.reuse === true, fresh: parsed.flags.fresh === true });
        break;
      case "status":
        result = await status();
        break;
      case "stop":
        result = await stop();
        break;
      case "reset":
        result = await reset({ yes: parsed.flags.yes === true });
        break;
      case "verify":
        result = await verify();
        break;
      default:
        process.stderr.write(`offline-stack: unknown command\n\n${HELP}`);
        process.exit(2);
    }
  } catch (err) {
    process.stderr.write(`${sanitizeError(err)}\n`);
    process.exit(1);
  }
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  // Nonzero exit when the command reports failure. This is the change
  // requested by the operator: a "verifyOverall:false" must not exit
  // 0, and a reset that failed mid-way must not exit 0.
  process.exit(ok(result?.ok === true) ? 0 : 1);
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`${sanitizeError(new Error(message))}\n`);
  process.exit(1);
});
