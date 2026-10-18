// `docker inspect` failures (TASK-053). Only "No such container /
// volume" may be read as "missing"; a daemon that is down, a missing
// docker binary, or a permission error must make `stop` / `status`
// exit non-zero, and `stop` must not persist a false "missing".
// A fake `docker` on PATH stands in for the daemon: no real Docker.
import { afterEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DEMO_PORT, containerNameFor, volumeNameFor } from "../../scripts/demo/lib/guard.mjs";
import { createState, saveState } from "../../scripts/demo/lib/state.mjs";

const temps: string[] = [];
afterEach(() => { for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true }); });

const DAEMON_DOWN = "Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?";
const PERMISSION = "permission denied while trying to connect to the Docker daemon socket at unix:///var/run/docker.sock";

// Every docker call prints `stderr` and exits 1.
function failingDocker(bin: string, stderr: string) {
  writeFileSync(join(bin, "docker"), `#!${process.execPath}\nprocess.stderr.write(${JSON.stringify(stderr + "\n")});process.exit(1);\n`, { mode: 0o700 });
}

// A reachable daemon on which our container and volume do not exist.
function emptyDocker(bin: string) {
  writeFileSync(join(bin, "docker"), `#!${process.execPath}\nconst a=process.argv.slice(2);if(a[1]==='inspect'){process.stderr.write('Error: No such '+a[0]+': '+a[2]+'\\n');process.exit(1)}process.stderr.write('unexpected call\\n');process.exit(97);\n`, { mode: 0o700 });
}

function setup() {
  const root = mkdtempSync(join(tmpdir(), "fera-docker-down-")); temps.push(root);
  const bin = join(root, "bin"); mkdirSync(bin);
  const state = createState({
    pid: 4242,
    port: DEMO_PORT,
    container: containerNameFor(root),
    volume: volumeNameFor(root),
    database: "fera_demo_premain_x",
    cache: { status: "ok", expected: [], present: 4, missing: [], tampered: [] },
    worktreeRoot: root,
  });
  const stateFile = saveState(state, { statePath: join(root, ".demo", "state.json"), worktreeRoot: root });
  return { root, bin, stateFile, bytes: readFileSync(stateFile, "utf8") };
}

function runCli(root: string, path: string, ...args: string[]) {
  return spawnSync(process.execPath, [resolve("scripts/demo/cli.mjs"), ...args], {
    cwd: root,
    env: { ...process.env, PATH: path },
    encoding: "utf8",
    timeout: 10_000,
  });
}

describe("docker unreachable (TASK-053)", () => {
  it.each([["daemon down", DAEMON_DOWN], ["permission denied", PERMISSION]])("stop exits 1 and keeps the state file when %s", (_name, stderr) => {
    const { root, bin, stateFile, bytes } = setup();
    failingDocker(bin, stderr);
    const r = runCli(root, bin + ":" + process.env.PATH, "stop");
    expect(r.status, r.stderr).toBe(1);
    const out = JSON.parse(r.stdout);
    expect(out.ok).toBe(false);
    expect(out.container.status).toBe("unknown");
    expect(out.container.status).not.toBe("missing");
    expect(readFileSync(stateFile, "utf8")).toBe(bytes);
  });

  it("stop exits 1 when the docker binary is missing", () => {
    const { root, bin, stateFile, bytes } = setup();
    // PATH holds only an empty dir: `docker` cannot be found at all.
    const r = runCli(root, bin, "stop");
    expect(r.status, r.stderr).toBe(1);
    expect(JSON.parse(r.stdout).ok).toBe(false);
    expect(readFileSync(stateFile, "utf8")).toBe(bytes);
  });

  it("status exits 1 and reports docker.ok:false, not a missing container", () => {
    const { root, bin } = setup();
    failingDocker(bin, DAEMON_DOWN);
    const r = runCli(root, bin + ":" + process.env.PATH, "status");
    expect(r.status, r.stderr).toBe(1);
    const out = JSON.parse(r.stdout);
    expect(out.ok).toBe(false);
    expect(out.docker.ok).toBe(false);
    expect(out.container.status).toBe("unknown");
    expect(out.db.reason).toBe("docker unreachable");
  });

  it("reset --yes exits 1 without removing the state file", () => {
    const { root, bin, stateFile, bytes } = setup();
    failingDocker(bin, DAEMON_DOWN);
    const r = runCli(root, bin + ":" + process.env.PATH, "reset", "--yes");
    expect(r.status, r.stderr).toBe(1);
    expect(r.stderr).toMatch(/docker container inspect .* failed/);
    expect(readFileSync(stateFile, "utf8")).toBe(bytes);
  });
});

describe("docker reachable, resources absent (TASK-053)", () => {
  it("stop reports the container as missing and exits 0", () => {
    const { root, bin } = setup();
    emptyDocker(bin);
    const r = runCli(root, bin + ":" + process.env.PATH, "stop");
    expect(r.status, r.stderr).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.ok).toBe(true);
    expect(out.container.status).toBe("missing");
    expect(out.volume).toBeNull();
  });
});
