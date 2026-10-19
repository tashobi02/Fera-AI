#!/usr/bin/env node
// Ensure the fresh schema's ENUM and TypeScript's writable actions stay aligned.
import { readFileSync } from "node:fs";

const states = readFileSync("src/contracts/states.ts", "utf8");
const actions = readFileSync("src/server/audit/actions.ts", "utf8");
const schema = readFileSync("db/schema_v2.sql", "utf8");

function actionValues(source, name) {
  const objectBody = source.match(new RegExp(`export const ${name} = \\{([\\s\\S]*?)\\n\\} as const;`))?.[1];
  if (!objectBody) throw new Error(`${name} action map missing`);
  return [...objectBody.matchAll(/^\s+\w+: "([a-z.]+)"/gm)].map((m) => m[1]);
}

const contracts = actionValues(states, "AUDIT_ACTIONS");
const serverActions = actionValues(actions, "CASE_AUDIT_ACTIONS");
const enumBody = schema.match(/CREATE TYPE audit_action_t\s+AS ENUM \(([\s\S]*?)\);/)?.[1];
if (!enumBody) throw new Error("audit_action_t enum missing from schema");
const dbActions = [...enumBody.matchAll(/'([a-z.]+)'/g)].map((m) => m[1]);
const expected = [...new Set([...contracts, ...serverActions, "case.close"])].sort();
const actual = [...new Set(dbActions)].sort();
if (expected.join("\n") !== actual.join("\n")) {
  process.stderr.write("audit action drift: update the TS actions or audit_action_t\n");
  process.exit(1);
}
process.stdout.write(`audit actions aligned (${actual.length})\n`);
