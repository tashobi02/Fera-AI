// model-fetch.mjs and reembed.mjs load src/server/embeddings/*.ts with
// Node's built-in type stripping, which is on by default from Node 22.18
// (and 23.6+, 24). The package.json `engines` still says ^22.12 (see
// docs/execution/evidence/embedding-dependency-note.md, open decision),
// so this helper fails closed on a too-old Node before any network or
// pipeline call.

const NODE_MIN = [22, 18];

export function nodeCanStripTypes(version = process.versions.node) {
  const [major, minor] = version.split(".").map(Number);
  if (major > NODE_MIN[0]) return true;
  if (major < NODE_MIN[0]) return false;
  return minor >= NODE_MIN[1];
}

export function requireTypeStripping(script) {
  if (nodeCanStripTypes()) return;
  console.error(
    `${script}: needs Node ${NODE_MIN[0]}.${NODE_MIN[1]} or newer (or a higher major with type stripping) because it loads TypeScript sources with built-in type stripping; this is Node ${process.versions.node}.`,
  );
  process.exit(1);
}
