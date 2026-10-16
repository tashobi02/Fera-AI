// Sol review: new BR-008 regressions, not copied from the fix-round probes.
import { assert, describe, expect, it, vi } from "vitest";
import { brandProviderDispatch, createLlmAdapter, ProviderFailure } from "@/server/ai";
import { emptyOutput, fakeProvider, inputFor, put, spanFor } from "./fixtures";

const dispatch = brandProviderDispatch((p, r, o) => p.extract(r, o));
type Row = [source: string, field: string, value: string | number, quote: string];
async function checked([raw, field, value, quote]: Row) {
  const source = `[MOCK] ${raw}`;
  const result = await createLlmAdapter({ primary: fakeProvider("primary", [put(emptyOutput(), source, field, value, quote)]), fallback: fakeProvider("fallback", []), dispatch, log: () => {} }).extract(inputFor(source));
  assert(result.ok);
  const [group, key] = field.split(".") as ["child" | "event" | "reporter", string];
  return { value: Reflect.get(result.draft[group], key), evidence: result.draft.evidence[field], source };
}
const UNSUPPORTED: Row[] = [
  ["clothing: ma\u034fybe blue shirt", "child.clothing", "ma\u034fybe blue shirt", "ma\u034fybe blue shirt"],
  ["clothing: ma\ufe0fybe blue shirt", "child.clothing", "ma\ufe0fybe blue shirt", "ma\ufe0fybe blue shirt"],
  ["clothing: no blue shirt", "child.clothing", "no blue shirt", "no blue shirt"],
  ["নাম রাফি নাকি রাহি", "child.name", "রাফি নাকি রাহি", "রাফি নাকি রাহি"],
  ["name: Rafi নাকি Rahi", "child.name", "Rafi নাকি Rahi", "Rafi নাকি Rahi"],
  ["বাবার নাম: করিম", "child.name", "করিম", "করিম"],
  ["father's name: Karim", "child.name", "Karim", "Karim"],
  ["বাবার clothing: blue shirt", "child.clothing", "blue shirt", "blue shirt"],
  ["মায়ের পোশাক: নীল জামা", "child.clothing", "নীল জামা", "নীল জামা"],
  ["not name: Rafi", "child.name", "Rafi", "Rafi"],
  ["নাম: রাফি না", "child.name", "রাফি না", "রাফি না"],
  ["clothing: not blue shirt", "child.clothing", "not blue shirt", "not blue shirt"],
  ["নাম: রাফি নাম: রাহি", "child.name", "রাফি নাম: রাহি", "রাফি নাম: রাহি"],
  ["name: Rafi name Rahi", "child.name", "Rafi name Rahi", "Rafi name Rahi"],
  ["নাম: রাফি ١", "child.name", "রাফি ١", "রাফি ١"],
  ["নাম: রাফি ²", "child.name", "রাফি ²", "রাফি ²"],
  ["নাম: রাফি রাফি", "child.name", "রাফি", "রাফি"],
  ["নাম: রাফি; নাম: রাহি", "child.name", "রাফি", "রাফি"],
  ["নাম: রাফি নাম: রাহি", "child.name", "রাহি", "রাহি"],
  ["clothing: ma\u200bybe blue shirt", "child.clothing", "ma\u200bybe blue shirt", "ma\u200bybe blue shirt"],
  ["পোশাক: সম্\u200dভবত নীল জামা", "child.clothing", "সম্\u200dভবত নীল জামা", "সম্\u200dভবত নীল জামা"],
  ["clothing: blue shirt, ma\u200cybe", "child.clothing", "blue shirt", "blue shirt"],
  ["my boy is not missing", "child.sex", "male", "boy"],
  ["not a boy", "child.sex", "male", "boy"],
  ["আমার ছেলে নয়", "child.sex", "male", "ছেলে"],
  ["আমার ছেলে: প্রতিবেশীর শিশু", "child.sex", "male", "ছেলে"],
  ["the witness is a boy", "child.sex", "male", "boy"],
  ["আমার মেয়ের পোশাক", "child.sex", "female", "মেয়ে"],
  ["বাবার ফোন: ০১৭১১২২৩৩৪৪", "reporter.phone", "01711223344", "০১৭১১২২৩৩৪৪"],
  ["do not phone: 01711223344", "reporter.phone", "01711223344", "01711223344"],
  ["phone: 01711223344 is wrong", "reporter.phone", "01711223344", "01711223344"],
  ["age: ১0 years", "child.age_years", 1, "১"],
  ["বাবার বয়স: ১০", "child.age_years", 10, "১০"],
  ["age: 1\u200b0 years", "child.age_years", 1, "1"],
  ["বাবা গতকাল বিকেলে এসেছিলেন", "event.at", "2026-10-13T16:00:00+06:00", "গতকাল বিকেলে"],
  ["appointment: 2026-10-13T12:00:00+06:00", "event.at", "2026-10-13T12:00:00+06:00", "2026-10-13T12:00:00+06:00"],
];
const SUPPORTED: Row[] = [
  ["নাম: রাফি রাফি", "child.name", "রাফি রাফি", "রাফি রাফি"],
  ["name: Rafi Hasan", "child.name", "Rafi Hasan", "Rafi Hasan"],
  ["নাম: রাফি; নাম: রাফি", "child.name", "রাফি", "রাফি"],
  ["বয়স: ১0 বছর", "child.age_years", 10, "১0"],
  ["height: ১2০ cm", "child.height_cm", 120, "১2০ cm"],
  ["বয়স: ৬-8 বছর", "child.age_max", 8, "৬-8 বছর"],
  ["নাম: কোয়েল".normalize("NFD"), "child.name", "কোয়েল".normalize("NFC"), "কোয়েল".normalize("NFD")],
  ["marks: ক্\u200dষ", "child.marks", "ক্\u200dষ", "ক্\u200dষ"],
  ["পোশাক: নীল জামা, বাবার নাম: করিম", "child.clothing", "নীল জামা", "নীল জামা"],
  ["আমাদের মেয়ে", "child.sex", "female", "মেয়ে"],
  ["sex: male", "child.sex", "male", "male"],
  ["my boy", "child.sex", "male", "boy"],
  ["phone no: ০17১12২৩3৪4", "reporter.phone", "01711223344", "০17১12২৩3৪4"],
  ["গতকাল বিকেলে", "event.at", "2026-10-13T16:00:00+06:00", "গতকাল বিকেলে"],
  ["2026-10-13T12:00:00+06:00", "event.at", "2026-10-13T12:00:00+06:00", "2026-10-13T12:00:00+06:00"],
];
describe("Sol BR-008 adversarial review", () => {
  it.each(UNSUPPORTED)("drops unsupported %j (%s)", async (source, field, value, quote) => {
    const got = await checked([source, field, value, quote]);
    expect(got.value).toBe(field === "child.sex" ? "unknown" : null);
    expect(got.evidence).toBeUndefined();
  });
  it.each(SUPPORTED)("keeps strict %j (%s), exact raw evidence", async (source, field, value, quote) => {
    const got = await checked([source, field, value, quote]);
    expect(got.value).toBe(value);
    expect(got.evidence).toMatchObject(spanFor(got.source, quote, got.evidence?.derivation));
  });
});

describe("Sol log privacy through default and injected sinks", () => {
  it("a checker throwing a hostile proxy stays E-012 without another paid dispatch", async () => {
    const hostile = new Proxy({}, { getPrototypeOf() { throw new Error("hostile prototype"); } });
    const output = emptyOutput();
    Object.defineProperty(output, "child", { get() { throw hostile; } });
    const primary = fakeProvider("primary", [output]);
    const fallback = fakeProvider("fallback", [emptyOutput()]);
    const adapter = createLlmAdapter({ primary, fallback, dispatch, log: () => {} });
    const result = await adapter.extract(inputFor("[MOCK] name: SyntheticChild"));
    expect(result.ok).toBe(false);
    assert(!result.ok);
    expect(result.error.error.id).toBe("E-012");
    expect(primary.extract).toHaveBeenCalledTimes(1);
    expect(fallback.extract).not.toHaveBeenCalled();
  });
  it.each(["status", "cause"])("ProviderFailure %s accessors do not break fallback", async (key) => {
    const failure = new ProviderFailure(503);
    Object.defineProperty(failure, key, { get() { throw new Error("sensitive accessor"); } });
    const adapter = createLlmAdapter({ primary: fakeProvider("primary", [failure]), fallback: fakeProvider("fallback", [emptyOutput()]), dispatch, log: () => {} });
    const result = await adapter.extract(inputFor("[MOCK] name: SyntheticChild"));
    expect(result.ok).toBe(true);
  });
  it("does not emit arbitrary status values to an injected logger", async () => {
    const error = new ProviderFailure(503);
    Object.defineProperty(error, "status", { value: { child: "SyntheticChild" } });
    const logs: unknown[] = [];
    const adapter = createLlmAdapter({ primary: fakeProvider("primary", [error]), fallback: fakeProvider("fallback", [emptyOutput()]), dispatch, log: (entry) => logs.push(entry) });
    await adapter.extract(inputFor("[MOCK] name: SyntheticChild"));
    expect(JSON.stringify(logs)).not.toContain("SyntheticChild");
  });
  it("does not treat token-shaped child values in error.name/code as safe metadata", async () => {
    const lines: string[] = [];
    const write = vi.spyOn(process.stdout, "write").mockImplementation((s) => { lines.push(String(s)); return true; });
    try {
      const error = Object.assign(new Error("child text"), { name: "SyntheticChild", code: "SYNTHETICCHILD" });
      const adapter = createLlmAdapter({ primary: fakeProvider("primary", [error]), fallback: fakeProvider("fallback", [error]), dispatch });
      await adapter.extract(inputFor("[MOCK] name: SyntheticChild"));
      expect(lines.join("")).not.toContain("SyntheticChild");
      expect(lines.join("")).not.toContain("SYNTHETICCHILD");
    } finally { write.mockRestore(); }
  });
  it("error metadata accessors cannot turn the manual fallback into a rejection", async () => {
    const error = new Error("child text");
    for (const key of ["name", "code", "message", "stack"]) Object.defineProperty(error, key, { get() { throw new Error("sensitive getter"); } });
    const logs: unknown[] = [];
    const adapter = createLlmAdapter({ primary: fakeProvider("primary", [error]), fallback: fakeProvider("fallback", [emptyOutput()]), dispatch, log: (entry) => logs.push(entry) });
    const result = await adapter.extract(inputFor("[MOCK] name: SyntheticChild"));
    expect(result.ok).toBe(true);
    expect(JSON.stringify(logs)).not.toContain("sensitive getter");
  });
  it("does not serialize source, output, evidence, cause or dropped values into real log lines", async () => {
    const lines: string[] = [];
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation((s) => { lines.push(String(s)); return true; });
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation((s) => { lines.push(String(s)); return true; });
    try {
      const source = "[MOCK] name: SyntheticChild; phone: ০১৭১১২২৩৩৪৪; clothing: blue shirt";
      const out = put(emptyOutput(), source, "child.name", "SyntheticChild", "SyntheticChild");
      put(out, source, "child.clothing", "wrong value", "blue shirt");
      const cause = Object.assign(new Error("SECRET_CAUSE SyntheticChild"), { output: out, sourceText: source, evidence: out.evidence });
      const adapter = createLlmAdapter({ primary: fakeProvider("primary", [new ProviderFailure(503, { cause })]), fallback: fakeProvider("fallback", [out]), dispatch });
      await adapter.extract(inputFor(source));
      const broken = createLlmAdapter({ primary: fakeProvider("primary", [out]), fallback: fakeProvider("fallback", []), dispatch, log: () => { throw cause; } });
      await broken.extract(inputFor(source));
      const serialized = lines.join("");
      for (const secret of [source, "SyntheticChild", "০১৭১১২২৩৩৪৪", "01711223344", "blue shirt", "wrong value", "SECRET_CAUSE", "sourceText", "normalisedText", "evidence", "cause", "child.name", "child.clothing"]) expect(serialized).not.toContain(secret);
      const parsed = lines.map((line) => JSON.parse(line));
      expect(parsed.some((line) => line.event === "ai.attempt" && line.level === 30)).toBe(true);
      expect(parsed.some((line) => line.event === "ai.log_failed")).toBe(true);
    } finally { stdout.mockRestore(); stderr.mockRestore(); }
  });
});
