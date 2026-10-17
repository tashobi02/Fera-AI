// model-fetch.mjs and reembed.mjs load src/server/embeddings/*.ts with Node's built-in type
// stripping, which is on by default from Node 22.18 (and 23.6+, 24). package.json `engines`
// still says ^22.12, which does not guarantee it (open decision for Mahim, evidence doc).
export function nodeCanStripTypes(version = process.versions.node) {
  const [major, minor] = version.split(".").map(Number);
  return major >= 24 || (major === 23 && minor >= 6) || (major === 22 && minor >= 18);
}

export function requireTypeStripping(script) {
  if (nodeCanStripTypes()) return;
  console.error(
    `${script}: needs Node 22.18 or newer (or 23.6+/24) because it loads TypeScript sources with built-in type stripping; this is Node ${process.versions.node}.`,
  );
  process.exit(1);
}
