// TASK-013 fix round 2: allowlist evidence checker (A1-A4, OD-013-10), silent-failure SF1-SF3, SN1-SN2, A6.
// Rebuilt from the round-2 probe cases (b.probe.ts was lost in a reboot; cases come from fix-013-r2.md and the probe listing).
import { assert, describe, expect, it, vi } from "vitest";
import { brandProviderDispatch, createLlmAdapter, ProviderFailure, type AiLogEntry } from "@/server/ai";
import { emptyOutput, fakeProvider, inputFor, put } from "./fixtures";

const dispatch = brandProviderDispatch((provider, request, options) => provider.extract(request, options));
function build(primary: readonly unknown[], fallback: readonly unknown[] = [emptyOutput()], log?: (e: AiLogEntry) => void) {
  const logs: AiLogEntry[] = [];
  const adapter = createLlmAdapter({ primary: fakeProvider("primary", primary), fallback: fakeProvider("fallback", fallback), dispatch, log: log ?? ((e) => logs.push(e)) });
  return { adapter, logs };
}
async function valueFor(source: string, field: string, value: string | number, quote: string) {
  const { adapter } = build([put(emptyOutput(), source, field, value, quote)]);
  const result = await adapter.extract(inputFor(source));
  assert(result.ok);
  const [group, key] = field.split(".") as ["child" | "event" | "reporter", string];
  const got = Reflect.get(result.draft[group], key);
  return got === "unknown" ? null : got;
}

type Row = [source: string, field: string, value: string | number, quote: string];
// A1: numeric facts only in the strict shape; every comparator, range, hedge or tail is unknown.
// 2026-10-16 (OD-013-10, fix round 3): qualifier/negation scope is the whole sentence, so the old A3 KEEP
// expectation for "পোশাক: নীল জামা, নাম রাফি না" now gives unknown (safe direction).
const SENTENCE_NEGATION_UNKNOWN: Row[] = [["পোশাক: নীল জামা, নাম রাফি না", "child.clothing", "নীল জামা", "নীল জামা"]];
const NUMERIC_UNKNOWN: Row[] = [
  ["বয়স ১০ এর বেশি", "child.age_years", 10, "১০"], ["বয়স ১০+", "child.age_years", 10, "১০"], ["age 10+", "child.age_years", 10, "10"],
  ["বয়স ১০ বছরের বেশি", "child.age_years", 10, "১০"], ["বয়স ১০-এর বেশি", "child.age_years", 10, "১০"], ["age: 10?", "child.age_years", 10, "10"],
  ["উচ্চতা ১২০ cm এর বেশি", "child.height_cm", 120, "১২০ cm"], ["age over 10", "child.age_years", 10, "10"],
  ["age over 10 years", "child.age_years", 10, "10 years"], ["over 10 years old", "child.age_years", 10, "10 years"],
  ["more than 10 years old", "child.age_years", 10, "10 years"], ["at least 10 years", "child.age_years", 10, "10 years"],
  ["under 10 years", "child.age_years", 10, "10 years"], ["less than 10 years", "child.age_years", 10, "10 years"],
  ["age ≥10", "child.age_years", 10, "10"], ["age ≥ 10 years", "child.age_years", 10, "10 years"], ["≥10 years", "child.age_years", 10, "10 years"],
  ["age >10 years", "child.age_years", 10, "10 years"], ["age <10 years", "child.age_years", 10, "10 years"], ["~10 years", "child.age_years", 10, "10 years"],
  ["বয়স ১০ এর উপরে", "child.age_years", 10, "১০"], ["১০ এর উপরে বয়স", "child.age_years", 10, "১০"], ["১০ বছরের উপরে", "child.age_years", 10, "১০"],
  ["১০ বছরের উপরে", "child.age_years", 10, "১০ বছর"], ["কমপক্ষে ১০ বছর", "child.age_years", 10, "১০ বছর"], ["অন্তত ১০ বছর", "child.age_years", 10, "১০ বছর"],
  ["১০ বছর বা তার বেশি", "child.age_years", 10, "১০ বছর"], ["১০ বছর ও তার বেশি", "child.age_years", 10, "১০ বছর"],
  ["১০ বছর বা তার উপরে", "child.age_years", 10, "১০ বছর"], ["১০ বছর মতো", "child.age_years", 10, "১০ বছর"],
  ["10 years and above", "child.age_years", 10, "10 years"], ["৯/১০ বছর", "child.age_years", 10, "১০ বছর"], ["৯ থেকে ১০ বছর", "child.age_years", 10, "১০ বছর"],
  ["between 9 and 10 years", "child.age_years", 10, "10 years"], ["over 120 cm", "child.height_cm", 120, "120 cm"],
  ["উচ্চতা প্রায় ১২০ cm", "child.height_cm", 120, "১২০ cm"], ["১২০ cm এর কম", "child.height_cm", 120, "১২০ cm"],
  ["বয়স প্রায় ১০", "child.age_years", 10, "১০"], ["প্রায় ১০ বছর", "child.age_years", 10, "১০ বছর"], ["probably 10 years", "child.age_years", 10, "10 years"],
  ["perhaps 10 years", "child.age_years", 10, "10 years"], ["approximately 10 years", "child.age_years", 10, "10 years"],
  // A4: the strict shape allows nothing after the unit, so a following word is not silently ignored.
  ["age 10 lessons at school", "child.age_years", 10, "10"], ["বয়স ১০ কমলা জামা", "child.age_years", 10, "১০"],
  ["age 10.5 years", "child.age_years", 10, "10"],
];
// A2/A3: names only from an explicit label; hedged clauses (own clause or a dangling neighbour) are unknown.
const TEXT_UNKNOWN: Row[] = [
  ["পোশাক: নীল বা লাল জামা", "child.clothing", "নীল বা লাল জামা", "নীল বা লাল জামা"], ["ছেলে রাফি বা রাহি", "child.name", "রাফি", "রাফি"],
  ["আমার ছেলে গতকাল বিকেলে হারিয়ে গেছে", "child.name", "গতকাল বিকেলে হারিয়ে গেছে", "গতকাল বিকেলে হারিয়ে গেছে"],
  ["আমার মেয়ে ৭ বছর বয়সী", "child.name", "৭ বছর বয়সী", "৭ বছর বয়সী"],
  ["clothing: blue shirt, probably", "child.clothing", "blue shirt", "blue shirt"], ["clothing: blue shirt, perhaps", "child.clothing", "blue shirt", "blue shirt"],
  ["name: Rafi, I guess", "child.name", "Rafi", "Rafi"], ["name: Rafi, probably", "child.name", "Rafi", "Rafi"],
  ["district: [MOCK] D1, likely", "event.district_text", "[MOCK] D1", "[MOCK] D1"],
  ["বোধহয় ছেলে", "child.sex", "male", "ছেলে"], ["মনে হয় ছেলে", "child.sex", "male", "ছেলে"], ["ছেলে", "child.sex", "male", "ছেলে"],
  ["নাম রাফি, বোধহয়", "child.name", "রাফি", "রাফি"], ["নাম রাফি, ঠিক জানি না", "child.name", "রাফি", "রাফি"],
  ["পোশাক: নীল জামা, মনে হচ্ছে", "child.clothing", "নীল জামা", "নীল জামা"], ["নাম রাফি নাকি রাহি", "child.name", "রাফি", "রাফি"],
  ["নাম রাফি না", "child.name", "রাফি", "রাফি"], ["name: Rafi2", "child.name", "Rafi2", "Rafi2"],
  // ছেলে/মেয়ে are never a name source (A2), including the shapes the old checker kept.
  ["ছেলে রাফি,", "child.name", "রাফি", "রাফি"], ["ছেলে রাফি, বয়স ১৩", "child.name", "রাফি", "রাফি"], ["মেয়ে মিতু,", "child.name", "মিতু", "মিতু"],
  ["ছেলে রাফি হাসান", "child.name", "রাফি", "রাফি"], ["ছেলে রাফি হাসান,", "child.name", "রাফি", "রাফি"], ["ছেলে রাফি হাসান", "child.name", "রাফি হাসান", "রাফি হাসান"],
  ["আমার ছেলে নিখোঁজ।", "child.name", "নিখোঁজ", "নিখোঁজ"], ["আমার ছেলে হারিয়েছে।", "child.name", "হারিয়েছে", "হারিয়েছে"],
  ["আমার মেয়ে ফেরেনি", "child.name", "ফেরেনি", "ফেরেনি"], ["আমার ছেলে আজ, বয়স ১৩", "child.name", "আজ", "আজ"],
  ["ছেলে: রাফি; মেয়ে: মিতু", "child.name", "রাফি", "রাফি"], ["ছেলেটি রাফি,", "child.name", "রাফি", "রাফি"],
  ["ছেলে\nরাফি", "child.name", "রাফি", "রাফি"], ["ছেলে ‍রাফি,", "child.name", "রাফি", "রাফি"],
];
const KEEP: Row[] = [
  ["সম্পর্ক: বাবা", "reporter.relation", "বাবা", "বাবা"], ["পোশাক: নীল জামা; বাবা খুঁজছেন", "child.clothing", "নীল জামা", "নীল জামা"],
  ["পোশাক: নীল জামা, বাবার সাথে ছিল", "child.clothing", "নীল জামা", "নীল জামা"], ["পোশাক: নীল জামা, নানার বাড়ি", "child.clothing", "নীল জামা", "নীল জামা"],
  ["পোশাক: বাদামি জামা", "child.clothing", "বাদামি জামা", "বাদামি জামা"], ["clothing: orange shirt", "child.clothing", "orange shirt", "orange shirt"],
  ["clothing: northern style shirt", "child.clothing", "northern style shirt", "northern style shirt"],
  ["clothing: notebook print shirt", "child.clothing", "notebook print shirt", "notebook print shirt"], ["clothing: abouti shirt", "child.clothing", "abouti shirt", "abouti shirt"],
  ["পোশাক: প্রায়োগিক জামা", "child.clothing", "প্রায়োগিক জামা", "প্রায়োগিক জামা"], ["পোশাক: নীল জামা, বাসায় ফেরেনি", "child.clothing", "নীল জামা", "নীল জামা"],
  ["বয়স ১০, নাম রাফি", "child.age_years", 10, "১০"], ["age 10 years, overall healthy", "child.age_years", 10, "10 years"],
  ["age 10, lessons at school", "child.age_years", 10, "10"], ["phone no: 01711223344", "reporter.phone", "01711223344", "01711223344"],
  ["নাম: রাফি", "child.name", "রাফি", "রাফি"], ["name: Rafi Hasan", "child.name", "Rafi Hasan", "Rafi Hasan"],
  ["আমার ছেলে, বয়স ১০", "child.sex", "male", "ছেলে"], ["my boy", "child.sex", "male", "boy"],
  ["বয়স ১০ বছর বয়সী", "child.age_years", 10, "১০ বছর"], ["10 years old", "child.age_years", 10, "10 years"], ["উচ্চতা: ১২০ সেমি", "child.height_cm", 120, "১২০ সেমি"],
];

describe("A1-A4: allowlist evidence checker", () => {
  it.each([...NUMERIC_UNKNOWN, ...TEXT_UNKNOWN, ...SENTENCE_NEGATION_UNKNOWN])("%j %s is unknown", async (source, field, value, quote) => {
    expect(await valueFor(`[MOCK] ${source}`, field, value, quote)).toBeNull();
  });
  it.each(KEEP)("%j %s is kept", async (source, field, value, quote) => {
    expect(await valueFor(`[MOCK] ${source}`, field, value, quote)).toBe(value === "male" ? "male" : value);
  });
  it("keeps an age range only for age_min/age_max in the strict range shape", async () => {
    expect(await valueFor("[MOCK] age 6-8 years", "child.age_min", 6, "6-8 years")).toBe(6);
    expect(await valueFor("[MOCK] age 6-8 years", "child.age_years", 6, "6-8 years")).toBeNull();
    expect(await valueFor("[MOCK] age 8 years", "child.age_min", 8, "8 years")).toBeNull();
  });
});

describe("SF1/SF2: outcome and per-reason counts survive the real logger", () => {
  function realLines(run: (log: (e: AiLogEntry) => void) => Promise<unknown>) {
    const lines: string[] = [];
    // The adapter's default sink writes through the project logger to stdout.
    const write = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => { lines.push(String(chunk)); return true; });
    return run(() => {}).finally(() => write.mockRestore()).then(() => lines.map((l) => JSON.parse(l)));
  }
  it("writes the outcome as an issues entry in production lines", async () => {
    const src = "[MOCK] clothing: blue shirt";
    const lines = await realLines(async () => {
      const { adapter } = (() => {
        const adapter = createLlmAdapter({ primary: fakeProvider("primary", [put(emptyOutput(), src, "child.clothing", "blue shirt", "blue shirt")]), fallback: fakeProvider("fallback", []), dispatch });
        return { adapter };
      })();
      await adapter.extract(inputFor(src));
    });
    const attempt = lines.find((l) => l.event === "ai.attempt");
    expect(attempt.issues).toEqual([{ code: "ok", path: "" }]);
    expect(attempt.rule).toBe("primary.first");
  });
  it("logs counts per drop reason, not one entry per field", async () => {
    // Round 4: a bare "C" is the abbreviated hedge "c" (circa, BLOCK B2) and makes the sentence uncertain, so the placeholder is G.
    const src = "[MOCK] name: A; clothing: B; marks: G; place: D; district: E; thana: F";
    const out = emptyOutput();
    for (const [field, quote] of [["child.name", "A"], ["child.clothing", "B"], ["child.marks", "G"], ["event.place_text", "D"], ["event.district_text", "E"], ["event.thana", "F"]]) put(out, src, field, `wrong ${quote}`, quote);
    const lines = await realLines(async () => {
      const adapter = createLlmAdapter({ primary: fakeProvider("primary", [out]), fallback: fakeProvider("fallback", []), dispatch });
      await adapter.extract(inputFor(src));
    });
    expect(lines.find((l) => l.event === "ai.attempt").issues).toEqual([{ code: "ok", path: "" }, { code: "span_mismatch", path: "6" }]);
    expect(JSON.stringify(lines)).not.toContain("child.name");
  });
  it("keeps the invalid reason with the outcome", async () => {
    const lines = await realLines(async () => {
      const adapter = createLlmAdapter({ primary: fakeProvider("primary", ["not json", "not json"]), fallback: fakeProvider("fallback", ["not json"]), dispatch });
      await adapter.extract(inputFor("[MOCK] clothing: blue shirt"));
    });
    expect(lines.filter((l) => l.event === "ai.attempt").every((l) => l.issues[0].code === "invalid_non_json")).toBe(true);
    expect(lines.find((l) => l.event === "ai.summary").issues).toEqual([{ code: "invalid", path: "3" }]);
  });
});

describe("SF3: an abort after a paid attempt still emits the summary", () => {
  it("abort between attempts logs ai.summary with an aborted tally, then rethrows", async () => {
    const controller = new AbortController();
    const { adapter, logs } = build([new ProviderFailure(503), "never"], [() => "never"]);
    // The first attempt fails (paid), then the caller aborts before the next one.
    const first = adapter.extract(inputFor("[MOCK] clothing: blue shirt"), { signal: controller.signal });
    queueMicrotask(() => controller.abort());
    await expect(first).rejects.toMatchObject({ name: "AbortError" });
    const summary = logs.find((e) => e.event === "ai.summary");
    expect(summary).toMatchObject({ ok: false });
    expect(summary?.tally?.aborted).toBeGreaterThanOrEqual(1);
  });
  it("mid-call abort logs the summary too", async () => {
    vi.useFakeTimers();
    try {
      const controller = new AbortController();
      const { adapter, logs } = build([() => new Promise<unknown>(() => {})]);
      const pending = adapter.extract(inputFor("[MOCK] clothing: blue shirt"), { signal: controller.signal });
      const check = expect(pending).rejects.toMatchObject({ name: "AbortError" });
      controller.abort();
      await check;
      expect(logs.filter((e) => e.event === "ai.summary")).toEqual([{ event: "ai.summary", ok: false, tally: { aborted: 1 } }]);
    } finally { vi.useRealTimers(); }
  });
  it("an abort before any attempt emits nothing", async () => {
    const controller = new AbortController();
    controller.abort();
    const { adapter, logs } = build([]);
    await expect(adapter.extract(inputFor("[MOCK] clothing: blue shirt"), { signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
    expect(logs).toEqual([]);
  });
});

describe("SN1/SN2: cause and failure kind", () => {
  it("ProviderFailure keeps an optional cause and the log shows its class only", async () => {
    const cause = Object.assign(new TypeError("[MOCK] secret text"), { code: "ECONNRESET" });
    const failure = new ProviderFailure(502, { cause });
    expect(failure.cause).toBe(cause);
    const { adapter, logs } = build([failure], [failure]);
    await adapter.extract(inputFor("[MOCK] clothing: blue shirt"));
    const attempt = logs.find((e) => e.event === "ai.attempt");
    expect(attempt).toMatchObject({ outcome: "unavailable", err_name: "TypeError", err_code: "ECONNRESET", status: 502 });
    expect(JSON.stringify(logs)).not.toContain("secret");
  });
  it("tells unavailable, unexpected and timeout apart on the E-013/E-014 result", async () => {
    const src = "[MOCK] clothing: blue shirt";
    const down = await build([new ProviderFailure(503)], [new ProviderFailure()]).adapter.extract(inputFor(src));
    const bug = await build([new TypeError("x")], [new TypeError("x")]).adapter.extract(inputFor(src));
    assert(!down.ok && !bug.ok);
    expect([down.error.error.id, down.failure]).toEqual(["E-013", "unavailable"]);
    expect([bug.error.error.id, bug.failure]).toEqual(["E-013", "unexpected"]);
    vi.useFakeTimers();
    try {
      const pending = build([() => new Promise(() => {})], [() => new Promise(() => {})]).adapter.extract(inputFor(src));
      await vi.advanceTimersByTimeAsync(60_000);
      const slow = await pending;
      assert(!slow.ok);
      expect([slow.error.error.id, slow.failure]).toEqual(["E-014", "timeout"]);
    } finally { vi.useRealTimers(); }
  });
});

describe("A6: phone-shaped error codes", () => {
  it("never logs a phone-shaped err_code or err_name", async () => {
    const odd = Object.assign(new Error("x"), { name: "E01711223344", code: "C01711223344" });
    const { adapter, logs } = build([odd], [odd]);
    await adapter.extract(inputFor("[MOCK] clothing: blue shirt"));
    expect(JSON.stringify(logs)).not.toContain("01711223344");
  });
  it("an input rejection logs its reason as the only issue", async () => {
    const lines: string[] = [];
    const write = vi.spyOn(process.stdout, "write").mockImplementation((c) => { lines.push(String(c)); return true; });
    try {
      const adapter = createLlmAdapter({ primary: fakeProvider("primary", []), fallback: fakeProvider("fallback", []), dispatch });
      await adapter.extract({ ...inputFor("[MOCK] x"), nowIso: "bad" });
    } finally { write.mockRestore(); }
    const rejected = lines.map((l) => JSON.parse(l)).find((l) => l.event === "ai.input_rejected");
    expect(rejected.issues).toEqual([{ code: "zod", path: "" }]);
  });
});
