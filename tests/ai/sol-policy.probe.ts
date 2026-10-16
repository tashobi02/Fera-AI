// RED by design; accepted residual risk OD-013-11
// Run explicitly: npx vitest run --config tests/ai/sol-policy.config.mjs
// Kept separate from the regression suite so its passing count never claims these are fixed.
import { assert, expect, it } from "vitest";
import { brandProviderDispatch, createLlmAdapter } from "@/server/ai";
import { emptyOutput, fakeProvider, inputFor, put } from "./fixtures";
it.each([
  ["নাম: রাফির বাবা করিম", "child.name", "রাফির বাবা করিম"],
  ["name: Rafi is missing", "child.name", "Rafi is missing"],
  ["বাবার তথ্য; নাম: করিম", "child.name", "করিম"],
])("semantic ownership policy: %s", async (raw, field, value) => {
  const source = `[MOCK] ${raw}`;
  const result = await createLlmAdapter({primary:fakeProvider("primary",[put(emptyOutput(),source,field,value,value)]),fallback:fakeProvider("fallback",[]),dispatch:brandProviderDispatch((p,r,o)=>p.extract(r,o)),log:()=>{}}).extract(inputFor(source));
  assert(result.ok);
  expect(result.draft.child.name).toBeNull();
});
