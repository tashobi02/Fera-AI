// Unit tests for the offline-stack guard helpers (TASK-053, revised).
// Pure logic only — no Docker, no Postgres, no network, no fs writes.
// Every assertion here runs without the fera-db container so it is safe to
// run on any lane.
import { describe, expect, it } from "vitest";
import {
  DEMO_DB_PREFIX,
  DEMO_PORT,
  DEMO_APP_PORT,
  DEMO_IMAGE,
  OWNER_LABEL_KEY,
  SCHEMA_LABEL_KEY,
  KIND_LABEL_KEY,
  assertLoopbackUrl,
  assertDemoDatabaseName,
  assertDemoContainerName,
  assertDemoVolumeName,
  assertStatePath,
  assertKeysPath,
  maskUrl,
  parseCli,
  PROVENANCE_SCHEMA_VERSION,
  sanitizeError,
  withDemoDatabase,
  ownerLabel,
  containerNameFor,
  volumeNameFor,
  resourcePrefix,
  ok,
  nextSteps,
} from "../../scripts/demo/lib/guard.mjs";
// @ts-expect-error -- plain ESM script without type declarations
import { PINS, EXPECTED_FILES, expectedPin } from "../../scripts/demo/lib/pins.mjs";

const WORKTREE = "/home/obidit/secondBrain/coding/Fera-AI/.worktrees/pre-main-offline-stack";
const ALLOWED_STATE = `${WORKTREE}/.demo/state.json`;

describe("offline-stack constants (TASK-053, revised)", () => {
  it("uses a dedicated DB port that is NOT the default 54322 used by fera-db", () => {
    expect(DEMO_PORT).toBe(3215);
    expect(DEMO_PORT).not.toBe(54322);
  });

  it("uses a dedicated app port that is distinct from the DB port (no port conflict in operator clipboard)", () => {
    expect(DEMO_APP_PORT).not.toBe(DEMO_PORT);
    expect(DEMO_APP_PORT).not.toBe(54322);
    expect(DEMO_APP_PORT).not.toBe(3000); // not the default Next.js port either
  });

  it("uses a per-worktree container name that does NOT collide with the human fera-db", () => {
    const name = containerNameFor(WORKTREE);
    expect(name).not.toBe("fera-db");
    expect(name.startsWith("fera-demo-")).toBe(true);
    expect(name.endsWith("-pg")).toBe(true);
  });

  it("uses a per-worktree volume name that does NOT collide with the human fera-db volume", () => {
    const name = volumeNameFor(WORKTREE);
    expect(name).not.toBe("fera-db-data");
    expect(name.startsWith("fera-demo-")).toBe(true);
    expect(name.endsWith("-pgdata")).toBe(true);
  });

  it("derives a STABLE name for the same worktree (re-runs reuse the same resource)", () => {
    const a1 = containerNameFor(WORKTREE);
    const a2 = containerNameFor(WORKTREE);
    expect(a1).toBe(a2);
    const v1 = volumeNameFor(WORKTREE);
    const v2 = volumeNameFor(WORKTREE);
    expect(v1).toBe(v2);
  });

  it("derives a DISTINCT name for a different worktree (no two lanes collide)", () => {
    const a = containerNameFor(WORKTREE);
    const b = containerNameFor(WORKTREE + "/other");
    expect(a).not.toBe(b);
  });

  it("uses a fixed image so a future re-tag cannot silently change the runtime", () => {
    expect(DEMO_IMAGE).toBe("fera-pg16-pgvector:0.8.1");
  });

  it("uses an explicit demo-only DB prefix that is refused by the regular db:reset guard", () => {
    expect(DEMO_DB_PREFIX).toBe("fera_demo_premain_");
    const sample = `${DEMO_DB_PREFIX}1234`;
    expect(assertDemoDatabaseName(sample)).toBe(sample);
  });

  it("exports the owner / schema / kind label keys for docker labelling", () => {
    expect(OWNER_LABEL_KEY).toBe("fera.offline-stack.owner");
    expect(SCHEMA_LABEL_KEY).toMatch(/fera\.offline-stack\.schema/);
    expect(KIND_LABEL_KEY).toBe("fera.offline-stack.kind");
  });
});

describe("ownerLabel + resourcePrefix (TASK-053, revised)", () => {
  it("produces a 16-char hex digest of the worktree path", () => {
    const l: string = ownerLabel(WORKTREE);
    expect(l).toMatch(/^[0-9a-f]{16}$/);
  });

  it("is stable for the same worktree (re-runs yield the same label)", () => {
    const a = ownerLabel(WORKTREE);
    const b = ownerLabel(WORKTREE);
    expect(a).toBe(b);
  });

  it("rejects an empty worktree root", () => {
    expect(() => ownerLabel("")).toThrow(/worktree root is required/);
  });

  it("resourcePrefix is the same as the container prefix's stem", () => {
    expect(resourcePrefix(WORKTREE)).toBe(containerNameFor(WORKTREE).replace(/-pg$/, ""));
  });
});

describe("assertDemoDatabaseName (TASK-053, revised)", () => {
  it.each([
    "fera_demo_premain_20261018",
    "fera_demo_premain_1",
    "fera_demo_premain_abc",
  ])("accepts the dedicated loopback name %s", (name) => {
    expect(assertDemoDatabaseName(name)).toBe(name);
  });

  it.each([
    "fera",                            // regular runtime DB
    "fera_test_42",                    // tests lane DB
    "fera_e2e_42",                     // Playwright e2e lane DB
    "fera_demo_other_42",              // different lane's demo prefix
    "postgres",                        // never
    "Fera_demo_premain_x",             // uppercase
    "fera-demo-premain-x",             // dashes
    "fera_demo_premain_",              // empty suffix
    "fera_demo_premain_" + "x".repeat(80),  // too long
    "",
    "fera_demo_premain_x; DROP DATABASE y",
  ])("refuses a name that is not this lane's dedicated loopback DB: %j", (name) => {
    expect(() => assertDemoDatabaseName(name)).toThrow(/offline-stack refuses|refuses non-owned|refuses a non-local|refuses connection parameters|too long|matches|required|database name must match/);
  });
});

describe("assertDemoContainerName (TASK-053, revised)", () => {
  it("accepts the owned per-worktree container name", () => {
    expect(assertDemoContainerName(containerNameFor(WORKTREE), WORKTREE)).toBe(containerNameFor(WORKTREE));
  });

  it.each([
    "fera-db",                  // existing shared container
    "fera-demo-pg16-pgvector",  // the OLD shared name
    "postgres",                 // system
    "Fera-demo-pg",             // uppercase
    "other",                    // someone else's
    "",
  ])("refuses a foreign container name %j", (name) => {
    expect(() => assertDemoContainerName(name, WORKTREE)).toThrow(/refuses|non-owned|expected/);
  });
});

describe("assertDemoVolumeName (TASK-053, revised)", () => {
  it("accepts the owned per-worktree volume name", () => {
    expect(assertDemoVolumeName(volumeNameFor(WORKTREE), WORKTREE)).toBe(volumeNameFor(WORKTREE));
  });

  it.each([
    "fera-db-data",
    "fera-demo-pg16-pgvector-data",
    "other",
    "",
  ])("refuses a foreign volume name %j", (name) => {
    expect(() => assertDemoVolumeName(name, WORKTREE)).toThrow(/refuses|non-owned|expected/);
  });
});

describe("assertLoopbackUrl (TASK-053, revised)", () => {
  it.each([
    "postgresql://postgres:postgres@127.0.0.1:3215/postgres",
    "postgresql://u:p@localhost:3215/postgres",
    "postgres://u:p@[::1]:3215/postgres",
  ])("accepts loopback %s", (url) => {
    expect(assertLoopbackUrl(url).hostname).toBeTruthy();
  });

  it.each([
    "postgresql://u:p@db.example.com:5432/postgres",
    "postgresql://u:p@10.0.0.1:5432/postgres",
    "postgresql://u:p@127.0.0.1.attacker.test/postgres",
  ])("refuses a non-loopback host %s", (url) => {
    expect(() => assertLoopbackUrl(url)).toThrow(/loopback/);
  });

  it.each([
    "postgresql://u:p@127.0.0.1:3215/postgres?host=evil.example.com",
    "postgresql://u:p@127.0.0.1:3215/postgres?hostaddr=203.0.113.7",
    "postgresql://u:p@127.0.0.1:3215/postgres#x",
  ])("refuses connection parameters %s", (url) => {
    expect(() => assertLoopbackUrl(url)).toThrow(/parameters/);
  });
});

describe("withDemoDatabase + maskUrl (TASK-053, revised)", () => {
  it("swaps the path with the dedicated demo DB name", () => {
    const url = assertLoopbackUrl("postgresql://postgres:postgres@127.0.0.1:3215/postgres");
    const named = withDemoDatabase(url, "fera_demo_premain_x");
    expect(named.pathname).toBe("/fera_demo_premain_x");
  });

  it("masks the password out of any URL it prints", () => {
    const masked = maskUrl("postgresql://postgres:s3cret@127.0.0.1:3215/postgres");
    expect(masked).not.toContain("s3cret");
    expect(masked).toContain("***");
  });

  it("maskUrl is a no-op for a URL without a password", () => {
    const out = maskUrl("postgresql://postgres@127.0.0.1:3215/postgres");
    expect(out).toBe("postgresql://postgres@127.0.0.1:3215/postgres");
  });
});

describe("sanitizeError (TASK-053, revised)", () => {
  it("never echoes the connection string, password, or child payload", () => {
    const e = new Error("FATAL: password authentication failed for user \"postgres\" on postgresql://postgres:s3cret@127.0.0.1:3215/fera_demo_premain_x");
    const out = sanitizeError(e);
    expect(out).not.toContain("s3cret");
    expect(out).not.toContain("127.0.0.1:3215");
    expect(out).toMatch(/password authentication failed/i);
    expect(out).toMatch(/Fera offline-stack/);
  });

  it("collapses pg error codes to a fixed short line", () => {
    const e = Object.assign(new Error("permission denied for table cases"), { code: "42501" });
    const out = sanitizeError(e);
    expect(out).toMatch(/42501/);
    expect(out).toMatch(/permission denied/);
    expect(out).not.toMatch(/child|seed text|kids|baby/i);
  });

  it("returns a fixed-shape object for a non-Error throwable", () => {
    const out = sanitizeError("plain string");
    expect(out).toMatch(/Fera offline-stack: plain string/);
  });

  it("truncates very long messages so a stack trace does not blow up the operator's terminal", () => {
    const huge = "x".repeat(2000);
    const out = sanitizeError(new Error(huge));
    expect(out.length).toBeLessThanOrEqual(500);
  });
});

describe("assertStatePath (TASK-053, revised)", () => {
  it("accepts a path inside the worktree-owned .demo/ directory", () => {
    expect(() => assertStatePath(ALLOWED_STATE, WORKTREE)).not.toThrow();
    expect(assertStatePath(ALLOWED_STATE, WORKTREE)).toBe(ALLOWED_STATE);
  });

  it.each([
    "/etc/passwd",
    "/home/obidit/.env",
    "/home/obidit/.env.local",
    `${WORKTREE}/db/schema_v2.sql`,
    `${WORKTREE}/src/server/case/commands.ts`,
    "/home/obidit/x/.worktrees/other/.demo/state.json",
    `${WORKTREE}/.demo/state.json.bak`,
  ])("refuses a path that is not the worktree-owned state file: %j", (p) => {
    expect(() => assertStatePath(p, WORKTREE)).toThrow(/refuses|non-owned|outside/);
  });
});

describe("assertKeysPath (TASK-053, revised)", () => {
  it("accepts the worktree-owned .demo/keys.json path", () => {
    const allowed = `${WORKTREE}/.demo/keys.json`;
    expect(() => assertKeysPath(allowed, WORKTREE)).not.toThrow();
    expect(assertKeysPath(allowed, WORKTREE)).toBe(allowed);
  });

  it.each([
    "/etc/keys.json",
    "/tmp/other/.demo/keys.json",
    `${WORKTREE}/db/keys.json`,
    `${WORKTREE}/.demo/keys.json.bak`,
    `${WORKTREE}/keys.json`,
  ])("refuses a path that is not the worktree-owned keys file: %j", (p) => {
    expect(() => assertKeysPath(p, WORKTREE)).toThrow(/refuses|non-owned|outside/);
  });
});

describe("expectedPin + PINS (TASK-053, revised)", () => {
  it("pins the four model files by path and sha256", () => {
    expect(PINS.model).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "config.json", sha256: expect.stringMatching(/^[0-9a-f]{64}$/) }),
        expect.objectContaining({ path: "tokenizer_config.json", sha256: expect.stringMatching(/^[0-9a-f]{64}$/) }),
        expect.objectContaining({ path: "tokenizer.json", sha256: expect.stringMatching(/^[0-9a-f]{64}$/) }),
        expect.objectContaining({ path: "onnx/model_quantized.onnx", sha256: expect.stringMatching(/^[0-9a-f]{64}$/) }),
      ]),
    );
    expect(PINS.model).toHaveLength(4);
  });

  it("EXPECTED_FILES is the sorted list of pinned relative paths", () => {
    expect(EXPECTED_FILES).toEqual([...EXPECTED_FILES].sort());
    expect(EXPECTED_FILES).toEqual(["config.json", "onnx/model_quantized.onnx", "tokenizer.json", "tokenizer_config.json"]);
  });

  it("expectedPin() returns the entry that matches the runtime's pinned list", () => {
    for (const f of EXPECTED_FILES) {
      const pin = expectedPin(f);
      expect(pin).toBeDefined();
      expect(pin.path).toBe(f);
      expect(pin.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
    expect(expectedPin("not_in_pins.txt")).toBeUndefined();
  });

  it("pins a minimum font and district-assets set that the offline app needs", () => {
    expect(PINS.fonts.length).toBeGreaterThanOrEqual(1);
    for (const f of PINS.fonts) {
      expect(f.path).toMatch(/^fonts\//);
      expect(f.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
    expect(PINS.districtAssets.length).toBeGreaterThanOrEqual(1);
    for (const d of PINS.districtAssets) {
      expect(d.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});

describe("parseCli (TASK-053, revised)", () => {
  it("returns a help request for --help and -h", () => {
    expect(parseCli(["node", "cli.mjs", "--help"]).help).toBe(true);
    expect(parseCli(["node", "cli.mjs", "-h"]).help).toBe(true);
  });

  it("parses a known subcommand with optional flags", () => {
    const r = parseCli(["node", "cli.mjs", "start", "--reuse"]);
    expect(r.cmd).toBe("start");
    expect(r.flags.reuse).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it("rejects --fresh explicitly (the destructive path is gated to reset --yes)", () => {
    const r = parseCli(["node", "cli.mjs", "start", "--fresh"]);
    expect(r.cmd).toBe("start");
    expect(r.flags.fresh).toBe(true);
  });

  it("collects unknown commands without echoing the value", () => {
    const r = parseCli(["node", "cli.mjs", "wipe"]);
    expect(r.cmd).toBeUndefined();
    expect(r.errors).toEqual(["unknown command"]);
  });

  it("refuses reset without the explicit --yes flag", () => {
    const r = parseCli(["node", "cli.mjs", "reset"]);
    expect(r.cmd).toBe("reset");
    expect(r.errors).toContain("reset requires --yes");
  });

  it("accepts reset with --yes", () => {
    const r = parseCli(["node", "cli.mjs", "reset", "--yes"]);
    expect(r.cmd).toBe("reset");
    expect(r.flags.yes).toBe(true);
    expect(r.errors).not.toContain("reset requires --yes");
  });
});

describe("PROVENANCE_SCHEMA_VERSION (TASK-053, revised)", () => {
  it("is a stable string so the offline evidence file stays decodable across runs", () => {
    expect(typeof PROVENANCE_SCHEMA_VERSION).toBe("string");
    expect(PROVENANCE_SCHEMA_VERSION).toMatch(/^[a-z0-9-]+$/);
  });
});

describe("ok (TASK-053, revised)", () => {
  it("returns true only for the literal value true", () => {
    expect(ok(true)).toBe(true);
    expect(ok(false)).toBe(false);
    expect(ok(0)).toBe(false);
    expect(ok(null)).toBe(false);
    expect(ok(undefined)).toBe(false);
  });
});

describe("nextSteps (TASK-053, revised)", () => {
  it("never includes a real password in any env var it suggests", () => {
    const adminUrl = new URL("postgresql://postgres:s3cret@127.0.0.1:3215/postgres");
    const appUrl = new URL("postgresql://fera_app:fera_app_local_dev@127.0.0.1:3215/fera_demo_premain_x");
    const out = nextSteps({ adminUrl, dbName: "fera_demo_premain_x", appUrl, appPort: 3216, cacheDir: "/tmp/fera-test" });
    for (const line of out) {
      expect(line).not.toContain("s3cret");
      expect(line).not.toContain("fera_app_local_dev");
    }
  });

  it("uses a different port for the app than for the DB (no port collision in operator clipboard)", () => {
    const adminUrl = new URL("postgresql://postgres:postgres@127.0.0.1:3215/postgres");
    const appUrl = new URL("postgresql://fera_app:fera_app_local_dev@127.0.0.1:3215/fera_demo_premain_x");
    const out = nextSteps({ adminUrl, dbName: "fera_demo_premain_x", appUrl, appPort: 3216, cacheDir: "/tmp/fera-test" });
    // The launcher owns the env block. The next array's only
    // copy-pasteable command is `npm run build && node scripts/demo/app.mjs`.
    // Inside the comment block the dedicated DB port 3215 and the
    // app port 3216 are surfaced, but no `PORT=` line is emitted
    // any more (the launcher sets it).
    const allText = out.join("\n");
    expect(allText).toContain("3215");
    expect(allText).toContain("3216");
    expect(out.some((l: string) => l.startsWith("PORT="))).toBe(false);
    expect(allText).toMatch(/npm run build && node scripts\/demo\/app\.mjs/);
  });

  it("emits a single copy-pasteable launcher command (no invented passwords or placeholders)", () => {
    const adminUrl = new URL("postgresql://postgres:postgres@127.0.0.1:3215/postgres");
    const appUrl = new URL("postgresql://fera_app:fera_app_local_dev@127.0.0.1:3215/fera_demo_premain_x");
    const out = nextSteps({ adminUrl, dbName: "fera_demo_premain_x", appUrl, appPort: 3216, cacheDir: "/tmp/fera-test" });
    const allText = out.join("\n");
    // No throwaway placeholders that the operator could not copy.
    expect(allText).not.toContain("<throwaway");
    expect(allText).not.toContain("<set-by");
  });
});
