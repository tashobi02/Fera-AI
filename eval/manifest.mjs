#!/usr/bin/env node
// TASK-064 compatibility entry point. The canonical manifest and loader live in manifest-lib.mjs.
import { pathToFileURL } from "node:url";
import { main } from "./build-manifest.mjs";

export {
  MANIFEST_REVISION,
  MANIFEST_SEED,
  DEV_FRACTION,
  EXPECTED,
  assertHeldOutAllowed,
  assertManifest,
  buildManifest,
  loadSplit,
  paths,
  serializeManifest,
  sha256,
} from "./manifest-lib.mjs";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2));
