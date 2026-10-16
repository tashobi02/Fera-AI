// RED by design; accepted residual risk OD-013-11 (semantic ownership).
// - "বাবা বিদেশে, ১০ বছর" → OD-013-11 (semantic ownership)
// - "ঠিক জানি না। রাফি। ১০ বছর" → OD-013-14 (a hedge two sentences back)
// Run explicitly: npx vitest run --config tests/ai/sol-policy.config.mjs
// Kept separate from the regression suite so its passing count never claims these are fixed.
import { assert, expect, it } from "vitest";
import { brandProviderDispatch, createLlmAdapter } from "@/server/ai";
import { emptyOutput, fakeProvider, inputFor, put } from "./fixtures";
it.each([
  ["নাম: রাফির বাবা করিম", "child.name", "রাফির বাবা করিম", "রাফির বাবা করিম", "direct" as const],
  ["name: Rafi is missing", "child.name", "Rafi is missing", "Rafi is missing", "direct" as const],
  ["বাবার তথ্য; নাম: করিম", "child.name", "করিম", "করিম", "direct" as const],
  ["বাবা বিদেশে, ১০ বছর", "child.age_years", 10, "১০", "digits" as const],
  ["ঠিক জানি না। রাফি। ১০ বছর", "child.age_years", 10, "১০", "digits" as const],
])("semantic ownership / over-abstention: %s", async (raw, field, value, quote, derivation) => {
  const source = `[MOCK] ${raw}`;
  const result = await createLlmAdapter({primary:fakeProvider("primary",[put(emptyOutput(),source,field,value,quote,derivation)]),fallback:fakeProvider("fallback",[]),dispatch:brandProviderDispatch((p,r,o)=>p.extract(r,o)),log:()=>{}}).extract(inputFor(source));
  assert(result.ok);
  // Each row must currently be RED by design (asserts the kept value is dropped).
  const [group, key] = field.split(".") as ["child" | "event" | "reporter", string];
  expect(Reflect.get(result.draft[group], key)).toBeNull();
});
