import { afterEach, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { assertStatePath, assertProvenancePath, ownerLabel, containerNameFor, volumeNameFor } from "../../scripts/demo/lib/guard.mjs";
const temps: string[] = [];
afterEach(() => { for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true }); });
it("refuses dangling state and provenance symlinks before writing", () => {
  const root = mkdtempSync(join(tmpdir(), "fera-symlink-")); temps.push(root);
  mkdirSync(join(root, ".demo"));
  for (const [name, guard] of [["state.json", assertStatePath], ["provenance.md", assertProvenancePath]] as const) {
    const outside = join(root, "outside-" + name);
    symlinkSync(outside, join(root, ".demo", name));
    expect(() => guard(join(root, ".demo", name), root)).toThrow(/symlink/);
    expect(existsSync(outside)).toBe(false);
  }
});
it.each(["running", "exited"])("never mutates a foreign %s container through actual helpers", status => {
  const root = mkdtempSync(join(tmpdir(), "fera-foreign-")); temps.push(root);
  const log = join(root, "calls.jsonl");
  const fake = join(root, "docker");
  writeFileSync(fake, `#!${process.execPath}\nconst fs=require('fs');const a=process.argv.slice(2);fs.appendFileSync(process.env.FERA_FAKE_DOCKER_LOG,JSON.stringify(a)+'\\n');if(a[0]==='container'&&a[1]==='inspect'){process.stdout.write('${status}\\n{}\\n');process.exit(0)}process.exit(97);\n`, { mode: 0o700 });
  const moduleUrl = new URL('file://' + resolve('scripts/demo/lib/docker.mjs')).href;
  const script = `import {startContainer,stopContainer,stopContainerKeepVolume} from ${JSON.stringify(moduleUrl)};for(const fn of [startContainer,stopContainer,stopContainerKeepVolume]){const r=await fn(process.cwd());if(r.ok)process.exit(3);}`;
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", script], { cwd: root, env: { ...process.env, PATH: root + ':' + process.env.PATH, FERA_FAKE_DOCKER_LOG: log }, encoding: "utf8", timeout: 10000 });
  expect(r.status, r.stderr).toBe(0);
  const calls: string[][] = readFileSync(log, 'utf8').trim().split('\n').map(line => JSON.parse(line));
  expect(calls).toHaveLength(3);
  expect(calls.every(a => a[0] === 'container' && a[1] === 'inspect')).toBe(true);
});
it("preserves state on partial reset and never sends destructive SQL via a host port", () => {
  const root = mkdtempSync(join(tmpdir(), "fera-partial-reset-")); temps.push(root);
  mkdirSync(join(root, ".demo"));
  const owner = ownerLabel(root);
  const stateFile = join(root, ".demo/state.json");
  const state = { schemaVersion: "offline-stack-v2", container: containerNameFor(root), volume: volumeNameFor(root), database: "fera_demo_premain_test", port: 3215, owner };
  const bytes = JSON.stringify(state); writeFileSync(stateFile, bytes);
  const log = join(root, 'calls.jsonl');
  writeFileSync(join(root, 'docker'), `#!${process.execPath}\nconst fs=require('fs');const a=process.argv.slice(2);fs.appendFileSync(process.env.FERA_FAKE_DOCKER_LOG,JSON.stringify(a)+'\\n');const labels={'fera.offline-stack.owner':process.env.FERA_TEST_OWNER,'fera.offline-stack.schema':'2','fera.offline-stack.kind':'offline-stack'};if(a[0]==='container'&&a[1]==='inspect'){console.log('running\\n'+JSON.stringify(labels));process.exit(0)}if(a[0]==='volume'&&a[1]==='inspect'){console.log(a[2]+'\\n'+JSON.stringify(labels));process.exit(0)}console.error('fixture removal failure');process.exit(1);\n`,{mode:0o700});
  writeFileSync(join(root, 'psql'), `#!${process.execPath}\nrequire('fs').appendFileSync(process.env.FERA_FAKE_DOCKER_LOG,'SQL_CALLED\\n');process.exit(98);\n`,{mode:0o700});
  const r=spawnSync(process.execPath,[resolve('scripts/demo/cli.mjs'),'reset','--yes'],{cwd:root,env:{...process.env,PATH:root+':'+process.env.PATH,FERA_TEST_OWNER:owner,FERA_FAKE_DOCKER_LOG:log},encoding:'utf8',timeout:10000});
  expect(r.status,r.stderr).toBe(1);
  expect(JSON.parse(r.stdout).statePreserved).toBe(true);
  expect(readFileSync(stateFile,'utf8')).toBe(bytes);
  expect(readFileSync(log,'utf8')).not.toContain('SQL_CALLED');
});
