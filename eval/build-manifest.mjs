// TASK-064: `npm run eval:manifest` writes eval/manifest.json + manifest.sha256; `-- --check` verifies them.
import { readFileSync, writeFileSync } from "node:fs";
import { assertManifest, buildManifest, paths, serializeManifest, sha256 } from "./manifest-lib.mjs";

const args = process.argv.slice(2);
const unknown = args.filter((a) => a !== "--check");
if (unknown.length) { console.error(`unknown argument: ${unknown.join(" ")}`); process.exit(2); }
const gt = JSON.parse(readFileSync(paths.groundTruth, "utf8"));
const text = serializeManifest(buildManifest(gt));
const line = `${sha256(text)}  manifest.json\n`;
if (args.includes("--check")) {
  let ok = true;
  try { if (readFileSync(paths.manifest, "utf8") !== text) { console.error("eval/manifest.json differs from the generator"); ok = false; } } catch { console.error("eval/manifest.json missing"); ok = false; }
  try { if (readFileSync(paths.hash, "utf8") !== line) { console.error("eval/manifest.sha256 differs"); ok = false; } } catch { console.error("eval/manifest.sha256 missing"); ok = false; }
  if (ok) { assertManifest(JSON.parse(text), gt, { sha256: sha256(text) }); console.log("manifest check OK"); }
  process.exit(ok ? 0 : 1);
}
writeFileSync(paths.manifest, text);
writeFileSync(paths.hash, line);
const c = assertManifest(JSON.parse(text), gt, { sha256: sha256(text) });
console.log(JSON.stringify(c.records), "records dev/test;", JSON.stringify(c.split_groups), "groups;", sha256(text));
