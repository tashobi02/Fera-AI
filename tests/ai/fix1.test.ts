// TASK-013 fix round 1: silent-failure (S1, S2, W1-W6) and safeguarding (SG1-SG3, SW1-SW2) regressions.
import { assert, describe, expect, it, vi } from "vitest";
import { brandProviderDispatch, createLlmAdapter, ProviderFailure, type AiLogEntry } from "@/server/ai";
import { emptyOutput, fakeProvider, inputFor, put } from "./fixtures";

const SOURCE = "[MOCK] clothing: blue shirt";
const goodOutput = () => put(emptyOutput(), SOURCE, "child.clothing", "blue shirt", "blue shirt");
const raw = (provider: { extract: (r: never, o: never) => Promise<unknown> }, request: never, options: never) => provider.extract(request, options);

function build(primary: readonly unknown[], fallback: readonly unknown[] = [emptyOutput()]) {
  const logs: AiLogEntry[] = [];
  const adapter = createLlmAdapter({
    primary: fakeProvider("primary", primary), fallback: fakeProvider("fallback", fallback),
    dispatch: brandProviderDispatch((provider, request, options) => provider.extract(request, options)), log: (entry) => logs.push(entry),
  });
  return { adapter, logs };
}

async function draftFor(source: string, field: string, value: string | number, quote: string) {
  const { adapter } = build([put(emptyOutput(), source, field, value, quote)]);
  const result = await adapter.extract(inputFor(source));
  assert(result.ok);
  const [group, key] = field.split(".") as ["child" | "event" | "reporter", string];
  return Reflect.get(result.draft[group], key);
}

describe("S1: unexpected dispatch failures are distinguishable from provider outages", () => {
  it("logs a typed ProviderFailure as unavailable with its status and the E-013 mapping", async () => {
    const { adapter, logs } = build([new ProviderFailure(503)], [new ProviderFailure()]);
    const result = await adapter.extract(inputFor(SOURCE));
    assert(!result.ok);
    expect(result.error.error.id).toBe("E-013");
    const attempts = logs.filter((e) => e.event === "ai.attempt");
    expect(attempts.map((e) => e.outcome)).toEqual(["unavailable", "unavailable"]);
    expect(attempts[0]).toMatchObject({ err_name: "ProviderFailure", status: 503, slot: "primary" });
  });

  it("logs an unexpected throw as a bug (class and code only, never the message) yet keeps the manual-form fallback", async () => {
    const bug = Object.assign(new TypeError(`${SOURCE} child text`), { code: "ERR_BUG" });
    const { adapter, logs } = build([bug], [bug]);
    const result = await adapter.extract(inputFor(SOURCE));
    assert(!result.ok);
    expect(result.error.error.id).toBe("E-013");
    expect(result.error.error.fallback).toBe("manual_form");
    const attempts = logs.filter((e) => e.event === "ai.attempt");
    expect(attempts.map((e) => e.outcome)).toEqual(["unexpected", "unexpected"]);
    expect(attempts[0]).toMatchObject({ err_name: "TypeError", err_code: "ERR_BUG" });
    expect(JSON.stringify(logs)).not.toContain("child text");
    expect(JSON.stringify(logs)).not.toContain("[MOCK]");
  });

  it("never logs an unsafe error name", async () => {
    const odd = Object.assign(new Error("x"), { name: "রাফি 01711223344" });
    const { adapter, logs } = build([odd], [odd]);
    await adapter.extract(inputFor(SOURCE));
    expect(JSON.stringify(logs)).not.toContain("রাফি");
    expect(JSON.stringify(logs)).not.toContain("01711223344");
  });
});

describe("S2: a bug in the output check cannot become a 500 after a paid call", () => {
  const throwing = () => ({ ...goodOutput(), get child(): never { throw new RangeError(`${SOURCE} secret`); } });

  it("returns E-012 with the source, keeps the cause, logs the class and stops (no further paid call)", async () => {
    const primary = fakeProvider("primary", [throwing()]);
    const fallback = fakeProvider("fallback", [goodOutput()]);
    const logs: AiLogEntry[] = [];
    const adapter = createLlmAdapter({ primary, fallback, dispatch: brandProviderDispatch((p, r, o) => p.extract(r, o)), log: (e) => logs.push(e) });
    const result = await adapter.extract(inputFor(SOURCE));
    assert(!result.ok);
    expect(result.error.error.id).toBe("E-012");
    expect(result.error.error.fallback).toBe("manual_form");
    expect(result.draft?.source_text).toBe(SOURCE);
    expect(result.cause).toBeInstanceOf(Error);
    expect(primary.extract).toHaveBeenCalledOnce();
    expect(fallback.extract).not.toHaveBeenCalled();
    const attempt = logs.find((e) => e.event === "ai.attempt");
    expect(attempt).toMatchObject({ outcome: "check_bug", err_name: "RangeError", error_id: "E-012" });
    expect(JSON.stringify(logs)).not.toContain("secret");
  });
});

describe("W1: dropped facts are distinguishable from never-extracted ones", () => {
  it("reports type_mismatch, span_mismatch, uncertain and conflict with field names", async () => {
    const source = "[MOCK] clothing: blue shirt; marks: maybe a scar; age: 7; age: 8; place: [MOCK] place A";
    const output = emptyOutput();
    put(output, source, "child.clothing", "blue shirt", "blue shirt");
    put(output, source, "child.marks", "a scar", "a scar");
    put(output, source, "child.age_years", 7, "7");
    put(output, source, "event.place_text", "[MOCK] place B", "[MOCK] place A");
    Object.assign(output.child, { height_cm: "tall" });
    const { adapter } = build([output], [output]);
    const result = await adapter.extract(inputFor(source));
    // Lead decision 2026-10-16: under the per-field rule a non-numeric height is dropped as type_mismatch,
    // never retried and never a guess, so the response stays ok.
    assert(result.ok);
    const byField = Object.fromEntries(result.dropped.map((d) => [d.field, d.reason]));
    // 2026-10-16 (OD-013-10, fix round 3): "maybe" scopes the whole sentence, so clothing, age and place are
    // now `uncertain` (the old kept/conflict/span_mismatch expectations are superseded; unknown is the safe direction).
    expect(byField).toEqual({ "child.height_cm": "type_mismatch", "child.clothing": "uncertain", "child.marks": "uncertain", "child.age_years": "uncertain", "event.place_text": "uncertain" });
    expect(result.draft?.child.clothing).toBeNull();
  });

  it("a never-extracted field is not reported as dropped", async () => {
    const { adapter, logs } = build([goodOutput()]);
    const result = await adapter.extract(inputFor(SOURCE));
    assert(result.ok);
    expect(result.dropped).toEqual([]);
    expect(logs.find((e) => e.event === "ai.attempt")?.dropped).toBeUndefined();
  });

  it("logs the dropped list per attempt", async () => {
    const output = put(emptyOutput(), SOURCE, "child.clothing", "red shirt", "blue shirt");
    const { adapter, logs } = build([output]);
    await adapter.extract(inputFor(SOURCE));
    expect(logs.find((e) => e.event === "ai.attempt")?.dropped).toEqual([{ field: "child.clothing", reason: "span_mismatch" }]);
  });
});

describe("W2: aborted attempts carry an aborted marker", () => {
  it("marks a mid-call abort and does not log it as a success", async () => {
    vi.useFakeTimers();
    try {
      const controller = new AbortController();
      const { adapter, logs } = build([() => new Promise<unknown>(() => {})]);
      const pending = adapter.extract(inputFor(SOURCE), { signal: controller.signal });
      const check = expect(pending).rejects.toMatchObject({ name: "AbortError" });
      controller.abort();
      await check;
      const attempts = logs.filter((e) => e.event === "ai.attempt");
      expect(attempts).toHaveLength(1);
      expect(attempts[0].outcome).toBe("aborted");
      expect(attempts[0].error_id).toBeUndefined();
    } finally { vi.useRealTimers(); }
  });
});

describe("W3/W4/W5/W6: summary line and reason codes", () => {
  it("logs one summary with the per-attempt outcome tally", async () => {
    const { adapter, logs } = build(["bad", new ProviderFailure()], [new ProviderFailure()]);
    await adapter.extract(inputFor(SOURCE));
    const summaries = logs.filter((e) => e.event === "ai.summary");
    expect(summaries).toEqual([{ event: "ai.summary", ok: false, error_id: "E-013", tally: { invalid: 1, unavailable: 2 } }]);
  });

  it("logs a success summary", async () => {
    const { adapter, logs } = build([goodOutput()]);
    await adapter.extract(inputFor(SOURCE));
    expect(logs.at(-1)).toEqual({ event: "ai.summary", ok: true, tally: { ok: 1 } });
  });

  it.each([
    ["zod", { ...inputFor(SOURCE), kind: "other" as never }],
    ["normalised_text_mismatch", { ...inputFor(SOURCE), normalisedText: "[MOCK] changed" }],
    ["normalise_status", { ...inputFor(SOURCE), sourceText: "" , normalisedText: ""}],
  ])("E-001 logs reason %s", async (reason, input) => {
    const { adapter, logs } = build([goodOutput()]);
    const result = await adapter.extract(input);
    assert(!result.ok);
    expect(result.error.error.id).toBe("E-001");
    expect(logs).toEqual([{ event: "ai.input_rejected", error_id: "E-001", reason }]);
  });

  it("separates non_json from schema_mismatch", async () => {
    const { adapter, logs } = build(["not json", { child: 1 }], [emptyOutput()]);
    await adapter.extract(inputFor(SOURCE));
    expect(logs.filter((e) => e.event === "ai.attempt").map((e) => e.reason)).toEqual(["non_json", "schema_mismatch", undefined]);
  });

  it("wholly malformed output (wrong shape, unknown keys) still retries; a bad field value does not", async () => {
    for (const bad of [{ child: 1 }, { ...emptyOutput(), extra: 1 }, [] as unknown]) {
      const { adapter, logs } = build([bad, emptyOutput()]);
      const result = await adapter.extract(inputFor(SOURCE));
      assert(result.ok);
      expect(logs.filter((e) => e.event === "ai.attempt").map((e) => e.reason)).toEqual(["schema_mismatch", undefined]);
    }
  });

  it("ai.log_failed names the error class only", async () => {
    const stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    try {
      const adapter = createLlmAdapter({ primary: fakeProvider("primary", [goodOutput()]), fallback: fakeProvider("fallback", []), dispatch: brandProviderDispatch(raw as never), log: () => { throw new TypeError(SOURCE); } });
      await adapter.extract(inputFor(SOURCE));
      expect(stderr).toHaveBeenCalledWith('{"event":"ai.log_failed","err_name":"TypeError"}\n');
    } finally { stderr.mockRestore(); }
  });
});

describe("SW1/SW2: dispatch brand and project logger", () => {
  it("a bare provider pass-through does not type-check as a dispatch", () => {
    const provider = fakeProvider("primary", []);
    // @ts-expect-error SW1: an unbranded function bypasses the notice/runPaidCall slot
    createLlmAdapter({ primary: provider, fallback: provider, dispatch: (p, r, o) => p.extract(r, o) });
    expect(true).toBe(true);
  });

  it("the default sink writes redacted project-logger lines", async () => {
    const write = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    try {
      const adapter = createLlmAdapter({ primary: fakeProvider("primary", [goodOutput()]), fallback: fakeProvider("fallback", []), dispatch: brandProviderDispatch((p, r, o) => p.extract(r, o)) });
      await adapter.extract(inputFor(SOURCE));
      const lines = write.mock.calls.map(([line]) => JSON.parse(String(line)));
      expect(lines.map((l) => l.event)).toEqual(["ai.attempt", "ai.summary"]);
      expect(lines[0]).toMatchObject({ level: 30, rule: "primary.first" });
      expect(JSON.stringify(lines)).not.toContain("blue shirt");
    } finally { write.mockRestore(); }
  });
});

describe("SG1: bounds, approximations and open-ended claims never become exact values", () => {
  it.each([
    ["বয়স ১০ বছরের বেশি", "child.age_years", 10, "১০"],
    ["বয়স ১০-এর বেশি", "child.age_years", 10, "১০"],
    ["বয়স ১০+", "child.age_years", 10, "১০"],
    ["age 10+", "child.age_years", 10, "10"],
    ["age: 10?", "child.age_years", 10, "10"],
    ["উচ্চতা ১২০ cm এর বেশি", "child.height_cm", 120, "১২০ cm"],
    ["বয়স ১০ বছরের বেশি", "child.age_min", 10, "১০"],
    ["age 10 or more", "child.age_years", 10, "10"],
    ["age 10 years over", "child.age_years", 10, "10"],
    ["age 10 less", "child.age_years", 10, "10"],
  ])("%s (%s) stays unknown", async (source, field, value, quote) => {
    expect(await draftFor(`[MOCK] ${source}`, field, value, quote)).toBeNull();
  });

  it("controls: plain exact claims still pass", async () => {
    expect(await draftFor("[MOCK] বয়স ১৩, নাম রাফি", "child.age_years", 13, "১৩")).toBe(13);
    expect(await draftFor("[MOCK] age 10 years", "child.age_years", 10, "10")).toBe(10);
    expect(await draftFor("[MOCK] উচ্চতা ১২০ cm", "child.height_cm", 120, "১২০ cm")).toBe(120);
  });
});

describe("SG2: hedged text stays unknown", () => {
  it.each([
    ["ছেলে রাফি বা রাহি", "child.name", "রাফি", "রাফি"],
    ["পোশাক: নীল বা লাল জামা", "child.clothing", "নীল বা লাল জামা", "নীল বা লাল জামা"],
    ["মনে হয় ছেলে", "child.sex", "male", "ছেলে"],
    ["পোশাক: সম্ভবত নীল জামা", "child.clothing", "সম্ভবত নীল জামা", "সম্ভবত নীল জামা"],
    ["জেলা: [MOCK] জেলা ১ হতে পারে", "event.district_text", "[MOCK] জেলা ১ হতে পারে", "[MOCK] জেলা ১ হতে পারে"],
    ["নাম রাফি (নিশ্চিত নই)", "child.name", "রাফি", "রাফি"],
    ["I think age 10", "child.age_years", 10, "10"],
    ["বয়স প্রায় ১০", "child.age_years", 10, "১০"],
    ["বয়স আনুমানিক ১০", "child.age_years", 10, "১০"],
    ["age about 10", "child.age_years", 10, "10"],
    ["age around 10", "child.age_years", 10, "10"],
    ["নাম রাফি, নিশ্চিত না", "child.name", "রাফি", "রাফি"],
  ])("%s", async (source, field, value, quote) => {
    expect([null, "unknown"]).toContain(await draftFor(`[MOCK] ${source}`, field, value, quote));
  });
});

describe("SG3: ছেলে/মেয়ে never yields a name", () => {
  it.each([
    ["আমার ছেলে গতকাল বিকেলে হারিয়ে গেছে", "গতকাল বিকেলে হারিয়ে গেছে"],
    ["আমার মেয়ে ৭ বছর বয়সী", "৭ বছর বয়সী"],
    ["আমার মেয়ে ৭ বছর বয়সী", "৭"],
    ["আমার ছেলে গতকাল বিকেলে", "গতকাল"],
  ])("%s does not make %s a name", async (source, value) => {
    expect(await draftFor(`[MOCK] ${source}`, "child.name", value, value)).toBeNull();
  });

  // Round 2 (OD-013-10): ছেলে/মেয়ে are no longer a name source; only an explicit নাম/name label is.
  it.each(["আমার ছেলে রাফি, বয়স ১৩", "আমার মেয়ে রাফি।", "আমার ছেলে রাফি", "ছেলে: রাফি; বয়স ১৩"])("%s no longer yields a name", async (source) => {
    expect(await draftFor(`[MOCK] ${source}`, "child.name", "রাফি", "রাফি")).toBeNull();
  });
});
