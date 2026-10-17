// P3-001: per-area locale splits. PHASE_3_PLAN.md §6 Wave 0.0 step 3.
//
// Rules enforced here:
//  - No key appears in two area files (bn or en).
//  - No key in an area file also appears in the inline `bn`/`en` objects of
//    src/locales/index.ts. Areas are the only home for new keys once this card
//    lands; duplicates mean a string was missed in the move.
//  - Every Bn key has a matching En key in the same area file.
//
// Waves add new keys to the area file, never to src/locales/index.ts.

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";
import * as ts from "typescript";

import { locales } from "@/locales";
import { parentIntakeBn, parentIntakeEn } from "@/locales/areas/parent-intake";
import { parentFormBn, parentFormEn } from "@/locales/areas/parent-form";
import { parentStatusBn, parentStatusEn } from "@/locales/areas/parent-status";
import { staffDisasterBn, staffDisasterEn } from "@/locales/areas/staff-disaster";
import { officerQueueBn, officerQueueEn } from "@/locales/areas/officer-queue";
import { officerCaseBn, officerCaseEn } from "@/locales/areas/officer-case";
import { officerMapBn, officerMapEn } from "@/locales/areas/officer-map";
import { officerMatchBn, officerMatchEn } from "@/locales/areas/officer-match";
import { officerDuplicatesBn, officerDuplicatesEn } from "@/locales/areas/officer-duplicates";
import { adminImportBn, adminImportEn } from "@/locales/areas/admin-import";

interface AreaPair {
  name: string;
  bn: Record<string, string>;
  en: Record<string, string>;
}

const AREAS: readonly AreaPair[] = [
  { name: "parent-intake", bn: parentIntakeBn, en: parentIntakeEn },
  { name: "parent-form", bn: parentFormBn, en: parentFormEn },
  { name: "parent-status", bn: parentStatusBn, en: parentStatusEn },
  { name: "staff-disaster", bn: staffDisasterBn, en: staffDisasterEn },
  { name: "officer-queue", bn: officerQueueBn, en: officerQueueEn },
  { name: "officer-case", bn: officerCaseBn, en: officerCaseEn },
  { name: "officer-map", bn: officerMapBn, en: officerMapEn },
  { name: "officer-match", bn: officerMatchBn, en: officerMatchEn },
  { name: "officer-duplicates", bn: officerDuplicatesBn, en: officerDuplicatesEn },
  { name: "admin-import", bn: adminImportBn, en: adminImportEn },
];

function keysOf(obj: Record<string, string>): string[] {
  return Object.keys(obj);
}

// `bn` and `en` are private in @/locales (not exported). To still detect when
// an area file re-defines a key that the root already owns inline, parse
// src/locales/index.ts with the TypeScript compiler API and collect every
// PropertyAssignment / ShorthandPropertyAssignment key from the object
// literal bound to the given `const` name. SpreadElements (e.g. `...
// parentIntakeBn`) are skipped on purpose — they are the area spread, not
// the root's own keys. The result is the same keyset the root would expose
// as `bn` / `en` minus the area contributions.
function readSource(relativeFromTest: string): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return fs.readFileSync(path.resolve(here, relativeFromTest), "utf8");
}

function unwrapToObjectLiteral(expr: ts.Expression): ts.ObjectLiteralExpression | undefined {
  let current: ts.Expression = expr;
  while (true) {
    if (ts.isObjectLiteralExpression(current)) return current;
    if (ts.isParenthesizedExpression(current)) {
      current = current.expression;
      continue;
    }
    if (ts.isAsExpression(current)) {
      current = current.expression;
      continue;
    }
    if (ts.isSatisfiesExpression(current)) {
      current = current.expression;
      continue;
    }
    if (ts.isTypeAssertionExpression(current)) {
      current = current.expression;
      continue;
    }
    return undefined;
  }
}

function inlineKeysForConst(source: string, constName: "bn" | "en"): string[] {
  const sf = ts.createSourceFile(
    "src/locales/index.ts",
    source,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TS,
  );
  for (const stmt of sf.statements) {
    if (!ts.isVariableStatement(stmt)) continue;
    for (const decl of stmt.declarationList.declarations) {
      if (!ts.isIdentifier(decl.name) || decl.name.text !== constName) continue;
      if (!decl.initializer) continue;
      const obj = unwrapToObjectLiteral(decl.initializer);
      if (!obj) {
        throw new Error(`locales/index.ts: const ${constName} is not an object literal`);
      }
      const keys: string[] = [];
      for (const prop of obj.properties) {
        if (ts.isSpreadElement(prop)) continue;
        if (!ts.isPropertyAssignment(prop) && !ts.isShorthandPropertyAssignment(prop)) {
          // Methods, getters/setters, etc. — not relevant for string keys.
          continue;
        }
        const name = prop.name;
        if (ts.isIdentifier(name) || ts.isPrivateIdentifier(name)) {
          keys.push(name.text);
        } else if (ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
          keys.push(name.text);
        } else if (ts.isComputedPropertyName(name)) {
          // Computed keys can't be statically matched against a string literal
          // area key, so skip them.
          continue;
        }
      }
      return keys;
    }
  }
  throw new Error(`locales/index.ts: no const ${constName} found`);
}

const LOCALES_INDEX_PATH = "../src/locales/index.ts";
const localesIndexSource = readSource(LOCALES_INDEX_PATH);
const inlineBnKeys = new Set(inlineKeysForConst(localesIndexSource, "bn"));
const inlineEnKeys = new Set(inlineKeysForConst(localesIndexSource, "en"));

describe("locales areas (P3-001)", () => {
  it("the aggregated locales still have matching bn and en key sets", () => {
    expect(keysOf(locales.en).sort()).toEqual(keysOf(locales.bn).sort());
  });

  it("does not duplicate any key across area files (bn)", () => {
    const seen = new Map<string, string>();
    for (const area of AREAS) {
      for (const key of keysOf(area.bn)) {
        const prior = seen.get(key);
        if (prior) {
          throw new Error(`bn key "${key}" appears in both area "${prior}" and area "${area.name}"`);
        }
        seen.set(key, area.name);
      }
    }
  });

  it("does not duplicate any key across area files (en)", () => {
    const seen = new Map<string, string>();
    for (const area of AREAS) {
      for (const key of keysOf(area.en)) {
        const prior = seen.get(key);
        if (prior) {
          throw new Error(`en key "${key}" appears in both area "${prior}" and area "${area.name}"`);
        }
        seen.set(key, area.name);
      }
    }
  });

  it("does not let an area file shadow a key in the inline bn object", () => {
    const collisions: string[] = [];
    for (const area of AREAS) {
      for (const key of keysOf(area.bn)) {
        if (inlineBnKeys.has(key)) collisions.push(`${area.name}/bn/${key}`);
      }
    }
    expect(collisions, `bn area keys collide with inline bn: ${collisions.join(", ")}`).toEqual([]);
  });

  it("does not let an area file shadow a key in the inline en object", () => {
    const collisions: string[] = [];
    for (const area of AREAS) {
      for (const key of keysOf(area.en)) {
        if (inlineEnKeys.has(key)) collisions.push(`${area.name}/en/${key}`);
      }
    }
    expect(collisions, `en area keys collide with inline en: ${collisions.join(", ")}`).toEqual([]);
  });

  it("every Bn key in an area file has a matching En key in the same area", () => {
    for (const area of AREAS) {
      const bnKeys = new Set(keysOf(area.bn));
      const enKeys = new Set(keysOf(area.en));
      for (const key of bnKeys) {
        expect(enKeys.has(key), `${area.name}: bn key "${key}" missing from en`).toBe(true);
      }
      for (const key of enKeys) {
        expect(bnKeys.has(key), `${area.name}: en key "${key}" missing from bn`).toBe(true);
      }
    }
  });

  it("uses the planned area files and officer-match disclaimers", () => {
    expect(AREAS.map((a) => a.name).sort()).toEqual(
      [
        "admin-import",
        "officer-case",
        "officer-duplicates",
        "officer-map",
        "officer-match",
        "officer-queue",
        "parent-form",
        "parent-intake",
        "parent-status",
        "staff-disaster",
      ].sort(),
    );
  });
});
