import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The V2 spec pack and its code companions are protected: feature PRs must not
// edit them (AGENTS.md "Sources of truth"). These checks fail CI if they drift.

type ManifestFile = { path: string; bytes: number; sha256: string };

const docs = join(import.meta.dirname, "..", "docs");
const manifest = JSON.parse(readFileSync(join(docs, "MANIFEST.json"), "utf8")) as {
  files: ManifestFile[];
};

const sha256 = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");

describe("protected spec pack", () => {
  it.each(manifest.files.map((f) => [f.path, f] as const))("%s matches docs/MANIFEST.json", (_, file) => {
    expect(sha256(join(docs, file.path))).toBe(file.sha256);
  });

  it("docs/spec is a byte-identical copy of docs/markdown", () => {
    const names = readdirSync(join(docs, "markdown"), { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .sort();
    expect(
      readdirSync(join(docs, "spec"), { withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name)
        .sort(),
    ).toEqual(names);
    for (const name of names) {
      expect(sha256(join(docs, "spec", name)), name).toBe(sha256(join(docs, "markdown", name)));
    }
  });
});
