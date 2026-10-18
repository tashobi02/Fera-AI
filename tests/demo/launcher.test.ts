import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, statSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
// @ts-expect-error -- demo helper is plain ESM.
import { loadOrCreateKeys, waitForAppUp, assertPortAvailable, waitForChild, childExitCode } from "../../scripts/demo/app.mjs";
const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
describe("real launcher helpers", () => {
  it("creates restrictive persistent 32-byte keys and refuses corrupt or weak replacements", async () => {
    const worktree = mkdtempSync(join(tmpdir(), "fera-keys-")); dirs.push(worktree);
    const first = await loadOrCreateKeys({ worktree });
    const file = join(worktree, ".demo/keys.json");
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(Buffer.from(first.authSecret, "base64url").length).toBe(32);
    expect((await loadOrCreateKeys({ worktree })).authSecret).toBe(first.authSecret);
    const parsed = JSON.parse(readFileSync(file, "utf8")); parsed.AUTH_SECRET = "x";
    writeFileSync(file, JSON.stringify(parsed));
    await expect(loadOrCreateKeys({ worktree })).rejects.toThrow(/missing AUTH_SECRET/);
    expect(JSON.parse(readFileSync(file, "utf8")).AUTH_SECRET).toBe("x");
    writeFileSync(file, "{");
    await expect(loadOrCreateKeys({ worktree })).rejects.toThrow(/corrupt/);
    expect(readFileSync(file, "utf8")).toBe("{");
  });
  it("requires healthy synthetic demo JSON and refuses an occupied port", async () => {
    let healthy = false;
    const server = createServer((_req, res) => { res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ db: healthy ? "ready" : "unavailable", embeddings: "ready", demo_mode: true, synthetic_only: true })); });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address(); if (!address || typeof address === "string") throw Error("port missing");
    try {
      await expect(assertPortAvailable(address.port)).rejects.toThrow(/occupied/);
      expect((await waitForAppUp(address.port, 60)).ok).toBe(false);
      healthy = true; expect((await waitForAppUp(address.port, 1000)).ok).toBe(true);
      expect((await waitForAppUp(address.port, 1000, { exitCode: 1, signalCode: null })).ok).toBe(false);
    } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
  });
  it("never turns a signal-killed child into exit 0 unless we forwarded that signal", async () => {
    expect(childExitCode(3, null)).toBe(3);
    expect(childExitCode(0, null)).toBe(0);
    expect(childExitCode(null, "SIGKILL")).toBe(137);
    expect(childExitCode(null, "SIGTERM")).toBe(143);
    expect(childExitCode(null, "SIGTERM", "SIGINT")).toBe(143);
    expect(childExitCode(null, "SIGINT", "SIGINT")).toBe(0);
    expect(childExitCode(null, "SIGTERM", "SIGTERM")).toBe(0);
    expect(childExitCode(null, null)).toBe(1);
    const killed = spawn(process.execPath, ["-e", "process.kill(process.pid, 'SIGKILL')"], { stdio: "ignore" });
    expect(await waitForChild({ child: killed })).toBe(137);
    const failed = spawn(process.execPath, ["-e", "process.exit(4)"], { stdio: "ignore" });
    expect(await waitForChild({ child: failed })).toBe(4);
  });
  it("waits for close so the child's output tail is drained", async () => {
    const child = spawn(process.execPath, ["-e", "process.stdout.write('x'.repeat(200000))"], { stdio: ["ignore", "pipe", "ignore"] });
    let bytes = 0;
    child.stdout.on("data", (b: Buffer) => { bytes += b.length; });
    expect(await waitForChild({ child })).toBe(0);
    expect(bytes).toBe(200000);
  });
});
