// Docker helper for the offline stack (TASK-053, revised).
//
// Two ownership invariants:
//   1. The container / volume / network name is per-worktree; it never
//      matches the human/dev `fera-db` (54322) container.
//   2. Even if the name happens to match a foreign resource, the
//      `inspectX` helpers refuse it unless it carries the owner label
//      `fera.offline-stack.owner=<our-hash>`.
//
// `run()` returns `{ code, stdout, stderr }` exactly once. The previous
// version swallowed the exit code when `ignoreExitCode` was true and
// the error branch never reached; that made the CLI think a failed
// docker command had succeeded. The new shape is a strict promise that
// either resolves with a triple OR rejects with a sanitized error.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  assertDemoContainerName,
  assertDemoPort,
  assertDemoVolumeName,
  containerNameFor,
  volumeNameFor,
  networkNameFor,
  DEMO_IMAGE,
  DEMO_PORT,
  OWNER_LABEL_KEY,
  SCHEMA_LABEL_KEY,
  KIND_LABEL_KEY,
  sanitizeError,
  ownerLabel,
} from "./guard.mjs";

const exec = promisify(execFile);

async function run(args, { ignoreExitCode = false } = {}) {
  let stdout = "";
  let stderr = "";
  let code = 1;
  try {
    const out = await exec("docker", args, { maxBuffer: 16 * 1024 * 1024 });
    stdout = out?.stdout?.toString?.() ?? "";
    stderr = out?.stderr?.toString?.() ?? "";
    code = 0;
  } catch (err) {
    stdout = err?.stdout?.toString?.() ?? "";
    stderr = err?.stderr?.toString?.() ?? "";
    code = typeof err?.code === "number" ? err.code : 1;
    if (!ignoreExitCode) {
      throw new Error(sanitizeError(err));
    }
  }
  return { code, stdout, stderr };
}

function ownerLabels(worktreeRoot) {
  return [
    `${OWNER_LABEL_KEY}=${ownerLabel(worktreeRoot)}`,
    `${SCHEMA_LABEL_KEY}=2`,
    `${KIND_LABEL_KEY}=offline-stack`,
  ];
}

export { run };

export async function dockerIsAvailable() {
  const { code, stderr } = await run(["version"], { ignoreExitCode: true });
  return code === 0 && !/server: .*ERROR/i.test(stderr);
}

// Parse a JSON-encoded docker labels map (the format docker emits for
// `{{.Config.Labels}}` / `{{.Labels}}`). Returns an empty object on
// empty / null / malformed input so a corrupt inspect never crashes
// the caller; the caller is responsible for failing closed on
// missing keys.
function parseDockerLabels(rawJson) {
  if (typeof rawJson !== "string" || rawJson.length === 0) return {};
  const trimmed = rawJson.trim();
  if (trimmed === "" || trimmed === "<no value>") return {};
  // docker prints `map[key:value key2:value2 ...]` for legacy inspect
  // output, but `--format "{{.Config.Labels}}"` on modern docker
  // emits a JSON object. We try JSON first; on parse failure fall
  // back to the `map[ ... ]` parsing so older engines still work.
  try {
    const out = JSON.parse(trimmed);
    if (out && typeof out === "object" && !Array.isArray(out)) return out;
  } catch {
    /* fall through to map[] parsing */
  }
  const out = {};
  const inner = trimmed.startsWith("map[") && trimmed.endsWith("]")
    ? trimmed.slice(4, -1)
    : trimmed;
  for (const pair of inner.split(/\s+/)) {
    if (!pair) continue;
    const ix = pair.indexOf(":");
    if (ix <= 0) continue;
    const k = pair.slice(0, ix);
    const v = pair.slice(ix + 1);
    out[k] = v;
  }
  return out;
}

// Look up the offline-stack container by exact name AND owner label.
// A container with the same name but a different owner is rejected:
// the helper returns null rather than operating on a foreign resource.
// The label check is exact equality (parsed JSON), not substring, so
// a foreign owner hash that happens to share a prefix with our hash
// (e.g. our hash "abc" vs a foreign label "...owner:abcdef...")
// cannot match us.
export async function inspectContainer(worktreeRoot) {
  const name = containerNameFor(worktreeRoot);
  assertDemoContainerName(name, worktreeRoot);
  const { stdout, code } = await run(
    ["container", "inspect", name, "--format", "{{.State.Status}}\n{{json .Config.Labels}}"],
    { ignoreExitCode: true },
  );
  if (code !== 0) return null;
  const lines = stdout.split("\n", 2);
  const status = (lines[0] ?? "").trim();
  const labels = parseDockerLabels(lines[1] ?? "");
  const owner = ownerLabel(worktreeRoot);
  const ownerOk = labels[OWNER_LABEL_KEY] === owner
    && labels[SCHEMA_LABEL_KEY] === "2"
    && labels[KIND_LABEL_KEY] === "offline-stack";
  if (!ownerOk) {
    return { name, status: status || "foreign", foreign: true };
  }
  return { name, status, labels };
}

export async function inspectVolume(worktreeRoot) {
  const name = volumeNameFor(worktreeRoot);
  assertDemoVolumeName(name, worktreeRoot);
  const { stdout, code } = await run(
    ["volume", "inspect", name, "--format", "{{.Name}}\n{{json .Labels}}"],
    { ignoreExitCode: true },
  );
  if (code !== 0) return null;
  const lines = stdout.split("\n", 2);
  if ((lines[0] ?? "").trim() !== name) return null;
  const labels = parseDockerLabels(lines[1] ?? "");
  const owner = ownerLabel(worktreeRoot);
  const ownerOk = labels[OWNER_LABEL_KEY] === owner
    && labels[SCHEMA_LABEL_KEY] === "2"
    && labels[KIND_LABEL_KEY] === "offline-stack";
  if (!ownerOk) {
    return { name, foreign: true, labels };
  }
  return { name, labels };
}

export async function imageExists(image = DEMO_IMAGE) {
  if (image !== DEMO_IMAGE) throw new Error("offline-stack: refusing non-owned image");
  const { code } = await run(["image", "inspect", image, "--format={{.Id}}"], { ignoreExitCode: true });
  return code === 0;
}

export async function buildImage(worktreeRoot, image = DEMO_IMAGE, contextDir = "db/docker") {
  if (image !== DEMO_IMAGE) throw new Error("offline-stack: refusing non-owned image");
  const { code, stderr } = await run(["build", "-t", image, contextDir], { ignoreExitCode: true });
  return { ok: code === 0, code, stderr };
}

// Bring the dedicated container up. The container is created fresh
// (or restarted if exited) with the per-worktree name + owner labels.
// It binds a host port distinct from the human/dev `fera-db` container
// so the two never collide.
export async function startContainer(worktreeRoot) {
  const name = containerNameFor(worktreeRoot);
  assertDemoContainerName(name, worktreeRoot);
  const port = assertDemoPort(DEMO_PORT);
  const vol = volumeNameFor(worktreeRoot);
  const labels = ownerLabels(worktreeRoot);

  // Foreign-owned container with same name? Refuse outright.
  const found = await inspectContainer(worktreeRoot);
  if (found && found.foreign === true) {
    return { ok: false, code: 1, stderr: "offline-stack: foreign-owned container with the same name exists; refusing to operate on it" };
  }
  if (found && found.status === "running") return { ok: true, status: "running" };
  if (found && found.status === "exited") {
    const r = await run(["start", name], { ignoreExitCode: true });
    if (r.code !== 0) return { ok: false, code: r.code, stderr: r.stderr };
    return { ok: true, status: "started (was exited)" };
  }

  // No container. First, ensure the volume exists with the owner
  // labels. `docker run -v name:/path` does not accept volume
  // labels, so we create the volume explicitly.
  const volInspect = await inspectVolume(worktreeRoot);
  if (volInspect?.foreign) return { ok: false, code: 1, stderr: "offline-stack: foreign-owned volume; refusing to attach" };
  if (!volInspect) {
    const args = ["volume", "create", vol, ...labels.flatMap((kv) => ["--label", kv])];
    const r = await run(args, { ignoreExitCode: true });
    if (r.code !== 0) return { ok: false, code: r.code, stderr: r.stderr };
  }

  // No container. Try `docker run` directly with explicit labels and
  // a per-worktree volume name. We avoid docker-compose to keep the
  // offline stack self-contained; compose is only a fallback for
  // operators who already have docker-compose installed.
  const r = await run([
    "run", "-d",
    "--name", name,
    "--label", labels[0],
    "--label", labels[1],
    "--label", labels[2],
    "-e", "POSTGRES_PASSWORD=postgres",
    "-p", `127.0.0.1:${port}:5432`,
    "-v", `${vol}:/var/lib/postgresql/data`,
    "--restart", "unless-stopped",
    DEMO_IMAGE,
  ], { ignoreExitCode: true });
  if (r.code !== 0) return { ok: false, code: r.code, stderr: r.stderr };
  return { ok: true, status: "created" };
}

// `rm -f` followed by `volume rm`. The container is removed FIRST so
// the data volume is no longer in use; only then is the volume
// dropped. The old order (volume-first) failed because the live
// container held the volume busy.
export async function stopContainer(worktreeRoot) {
  const name = containerNameFor(worktreeRoot);
  assertDemoContainerName(name, worktreeRoot);
  const found = await inspectContainer(worktreeRoot);
  if (found && found.foreign === true) {
    return { ok: false, code: 1, stderr: "offline-stack: foreign-owned container with the same name exists; refusing to operate on it" };
  }
  if (!found) return { ok: true, status: "missing" };
  const r = await run(["rm", "-f", name], { ignoreExitCode: true });
  if (r.code !== 0) return { ok: false, code: r.code, stderr: r.stderr };
  // After the container is gone the volume can be removed.
  const v = await run(["volume", "rm", "-f", volumeNameFor(worktreeRoot)], { ignoreExitCode: true });
  return { ok: v.code === 0, status: "removed+volume", volumeOk: v.code === 0, volumeStderr: v.code === 0 ? null : v.stderr };
}

// Container-only stop (volume kept). Used by the regular `stop`
// command so a future `start --reuse` keeps the synthetic data.
export async function stopContainerKeepVolume(worktreeRoot) {
  const name = containerNameFor(worktreeRoot);
  assertDemoContainerName(name, worktreeRoot);
  const found = await inspectContainer(worktreeRoot);
  if (found && found.foreign === true) {
    return { ok: false, code: 1, stderr: "offline-stack: foreign-owned container with the same name exists; refusing to operate on it" };
  }
  if (!found) return { ok: true, status: "missing" };
  const r = await run(["rm", "-f", name], { ignoreExitCode: true });
  if (r.code !== 0) return { ok: false, code: r.code, stderr: r.stderr };
  return { ok: true, status: "removed (volume kept)" };
}

export async function waitForReady(worktreeRoot, timeoutMs = 60_000) {
  const name = containerNameFor(worktreeRoot);
  assertDemoContainerName(name, worktreeRoot);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const r = await run(["exec", name, "pg_isready", "-h", "127.0.0.1", "-U", "postgres"], { ignoreExitCode: true });
    if (r.code === 0) return { ok: true };
    await new Promise((res) => setTimeout(res, 500));
  }
  return { ok: false, reason: "timeout" };
}

// Network name export (not used by `start` today; kept for completeness
// so a future operator who wants external DNS to address the
// container can do so without renaming).
export { containerNameFor, volumeNameFor, networkNameFor };
