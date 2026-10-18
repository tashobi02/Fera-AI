#!/usr/bin/env node
// TASK-064: generate or check the canonical eval manifest and its SHA-256.
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { assertManifest, buildManifest, paths, serializeManifest, sha256 } from "./manifest-lib.mjs";

export function main(argv = process.argv.slice(2)) {
  const unknown = argv.filter((arg) => arg !== "--check" && arg !== "--");
  if (unknown.length) {
    console.error(`eval:manifest: unknown argument ${unknown.join(" ")}`);
    process.exitCode = 2;
    return;
  }

  const groundTruthBytes = readFileSync(paths.groundTruth);
  const recordsBytes = readFileSync(paths.records);
  const groundTruth = JSON.parse(groundTruthBytes.toString("utf8"));
  const text = serializeManifest(buildManifest(groundTruth, { groundTruthBytes, recordsBytes }));
  const hashLine = `${sha256(text)}  manifest.json\n`;
  const manifest = JSON.parse(text);
  assertManifest(manifest, groundTruth, { sha256: sha256(text), groundTruthBytes, recordsBytes });

  if (argv.includes("--check")) {
    let valid = true;
    try {
      if (readFileSync(paths.manifest, "utf8") !== text) { console.error("eval/manifest.json differs from the generator"); valid = false; }
    } catch {
      console.error("eval/manifest.json missing");
      valid = false;
    }
    try {
      if (readFileSync(paths.hash, "utf8") !== hashLine) { console.error("eval/manifest.sha256 differs"); valid = false; }
    } catch {
      console.error("eval/manifest.sha256 missing");
      valid = false;
    }
    if (valid) console.log(`eval:manifest --check OK (${manifest.counts.by_split.dev.records} dev / ${manifest.counts.by_split.test.records} test records; ${sha256(text)})`);
    else process.exitCode = 1;
    return;
  }

  writeFileSync(paths.manifest, text);
  writeFileSync(paths.hash, hashLine);
  console.log(`wrote eval/manifest.json (sha256 ${sha256(text)}, groups ${manifest.counts.groups}, dev ${manifest.counts.by_split.dev.records} / test ${manifest.counts.by_split.test.records})`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
