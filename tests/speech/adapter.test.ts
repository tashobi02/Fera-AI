import { afterEach, assert, describe, expect, it, vi } from "vitest";
import {
  createSttAdapter,
  DispatchRefused,
  SttFailure,
  SttTimeoutError,
  type RawSttDispatch,
  type SttLogEntry,
} from "@/server/speech";
import { brandSttDispatch } from "@/server/speech/types";
import { fakeSttProvider, sampleAudio, type ScriptedStep } from "./fakes";

function setup(
  primarySteps: readonly ScriptedStep[],
  fallbackSteps?: readonly ScriptedStep[],
  dispatch?: RawSttDispatch,
  timeoutMs?: number,
) {
  const primary = fakeSttProvider("primary", primarySteps);
  const fallback = fallbackSteps ? fakeSttProvider("fallback", fallbackSteps) : undefined;
  const logs: SttLogEntry[] = [];
  const dispatchSpy = vi.fn<RawSttDispatch>(
    dispatch ?? ((provider, audio, opts) => provider.transcribe(audio, opts)),
  );
  const adapter = createSttAdapter({
    primary,
    fallback,
    dispatch: brandSttDispatch(dispatchSpy),
    timeoutMs,
    log: (entry) => logs.push(entry),
  });
  return { adapter, primary, fallback, dispatch: dispatchSpy, logs };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("COMP-006 Speech Adapter (TASK-014 / FR-002 / BR-023)", () => {
  it("transcribes audio successfully using primary provider", async () => {
    const { adapter, primary, fallback, logs } = setup(
      ["আমার ছেলে রাফি, বয়স ১৩"],
      ["ফলব্যাক টেক্সট"],
    );
    const result = await adapter.transcribe(sampleAudio());

    assert(result.ok);
    expect(result.text).toBe("আমার ছেলে রাফি, বয়স ১৩");
    expect(primary.transcribe).toHaveBeenCalledOnce();
    expect(fallback?.transcribe).not.toHaveBeenCalled();

    const attempts = logs.filter((l) => l.event === "speech.attempt");
    expect(attempts).toHaveLength(1);
    expect(attempts[0].slot).toBe("primary");
    expect(attempts[0].outcome).toBe("ok");
    expect(attempts[0].duration_ms).toBeGreaterThanOrEqual(0);

    const summaries = logs.filter((l) => l.event === "speech.summary");
    expect(summaries).toHaveLength(1);
    expect(summaries[0].ok).toBe(true);
  });

  it("maps empty or whitespace transcript to E-010 without dispatching fallback", async () => {
    const { adapter, primary, fallback, logs } = setup(
      ["   \n\t  "],
      ["ফলব্যাক টেক্সট"],
    );
    const result = await adapter.transcribe(sampleAudio());

    assert(!result.ok);
    expect(result.error.error.id).toBe("E-010");
    expect(result.error.error.key).toBe("SPEECH_UNINTELLIGIBLE");
    expect(result).not.toHaveProperty("failure");
    expect(primary.transcribe).toHaveBeenCalledOnce();
    expect(fallback?.transcribe).not.toHaveBeenCalled();

    const attempts = logs.filter((l) => l.event === "speech.attempt");
    expect(attempts).toHaveLength(1);
    expect(attempts[0].outcome).toBe("unintelligible");
    expect(attempts[0].error_id).toBe("E-010");

    const summaries = logs.filter((l) => l.event === "speech.summary");
    expect(summaries[0].ok).toBe(false);
    expect(summaries[0].error_id).toBe("E-010");
  });

  it("fails over to fallback when primary provider is down", async () => {
    const { adapter, primary, fallback, logs } = setup(
      [new SttFailure(503)],
      ["রাফি মিরপুর থেকে নিখোঁজ"],
    );
    const result = await adapter.transcribe(sampleAudio());

    assert(result.ok);
    expect(result.text).toBe("রাফি মিরপুর থেকে নিখোঁজ");
    expect(primary.transcribe).toHaveBeenCalledOnce();
    expect(fallback?.transcribe).toHaveBeenCalledOnce();

    const attempts = logs.filter((l) => l.event === "speech.attempt");
    expect(attempts).toHaveLength(2);
    expect(attempts[0].slot).toBe("primary");
    expect(attempts[0].outcome).toBe("unavailable");
    expect(attempts[0].error_id).toBe("E-011");
    expect(attempts[0]).not.toHaveProperty("status");
    expect(attempts[0].err_name).toBe("SttFailure");

    expect(attempts[1].slot).toBe("fallback");
    expect(attempts[1].outcome).toBe("ok");

    const summaries = logs.filter((l) => l.event === "speech.summary");
    expect(summaries[0].ok).toBe(true);
  });

  it("maps to E-011 when both primary and fallback are down", async () => {
    const { adapter, primary, fallback, logs } = setup(
      [new SttFailure(503)],
      [new SttFailure(502)],
    );
    const result = await adapter.transcribe(sampleAudio());

    assert(!result.ok);
    expect(result.error.error.id).toBe("E-011");
    expect(result.error.error.key).toBe("SPEECH_UNAVAILABLE");
    expect(result.failure).toBe("unavailable");
    expect(primary.transcribe).toHaveBeenCalledOnce();
    expect(fallback?.transcribe).toHaveBeenCalledOnce();

    const summaries = logs.filter((l) => l.event === "speech.summary");
    expect(summaries[0].ok).toBe(false);
    expect(summaries[0].error_id).toBe("E-011");
  });

  it("maps to E-014 on timeout after 25s", async () => {
    vi.useFakeTimers();
    const hang = () => new Promise<{ text: string }>(() => {});
    const { adapter, logs } = setup([hang], [hang]);

    const pending = adapter.transcribe(sampleAudio());
    // Primary attempt times out at 25s
    await vi.advanceTimersByTimeAsync(25_000);
    // Fallback attempt times out at another 25s
    await vi.advanceTimersByTimeAsync(25_000);

    const result = await pending;
    assert(!result.ok);
    expect(result.error.error.id).toBe("E-014");
    expect(result.error.error.key).toBe("AI_TIMEOUT");
    expect(result.failure).toBe("timeout");

    const attempts = logs.filter((l) => l.event === "speech.attempt");
    expect(attempts).toHaveLength(2);
    expect(attempts[0].outcome).toBe("timeout");
    expect(attempts[0].error_id).toBe("E-014");
    expect(attempts[1].outcome).toBe("timeout");
    expect(attempts[1].error_id).toBe("E-014");
  });

  it("enforces timeout cap at 25 000 ms even if caller requests a larger timeout", async () => {
    vi.useFakeTimers();
    const hang = () => new Promise<{ text: string }>(() => {});
    const { adapter } = setup([hang], undefined, undefined, 60_000);

    const pending = adapter.transcribe(sampleAudio());
    await vi.advanceTimersByTimeAsync(25_000);

    const result = await pending;
    assert(!result.ok);
    expect(result.error.error.id).toBe("E-014");
  });

  it("does not dispatch when caller signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const { adapter, dispatch } = setup(["রাফি"]);

    await expect(
      adapter.transcribe(sampleAudio(), { signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError", message: "Transcription aborted" });

    expect(dispatch).not.toHaveBeenCalled();
  });

  it("aborts mid-call, notifies provider, and never triggers fallback", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const { adapter, dispatch, primary, fallback, logs } = setup(
      [() => new Promise<{ text: string }>(() => {})],
      ["fallback text"],
    );

    const pending = adapter.transcribe(sampleAudio(), { signal: controller.signal });
    const check = expect(pending).rejects.toMatchObject({
      name: "AbortError",
      message: "Transcription aborted",
    });

    controller.abort(new Error("caller cancelled"));
    await check;

    expect(primary.transcribe.mock.calls[0][1].signal.aborted).toBe(true);
    expect(fallback?.transcribe).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledOnce();

    const attempts = logs.filter((l) => l.event === "speech.attempt");
    expect(attempts).toHaveLength(1);
    expect(attempts[0].outcome).toBe("aborted");

    const summaries = logs.filter((l) => l.event === "speech.summary");
    expect(summaries[0].ok).toBe(false);
    expect(summaries[0].outcome).toBe("aborted");
  });

  it("logs unexpected bug as error class only and does not mislabel it as an outage", async () => {
    const unexpected = new TypeError("[MOCK] cannot read property of undefined");
    const { adapter, primary, logs } = setup([unexpected]);

    const result = await adapter.transcribe(sampleAudio());
    assert(!result.ok);
    expect(result.failure).toBe("unexpected");
    expect(result.error.error.id).toBe("E-021");
    expect(result.error.error.key).toBe("INTERNAL");
    expect(primary.transcribe).toHaveBeenCalledOnce();

    const attempts = logs.filter((l) => l.event === "speech.attempt");
    expect(attempts).toHaveLength(1);
    expect(attempts[0].outcome).toBe("unexpected");
    expect(attempts[0].outcome).not.toBe("unavailable");
    expect(attempts[0].err_name).toBe("TypeError");
    expect(attempts[0]).not.toHaveProperty("message");

    const logString = JSON.stringify(logs);
    expect(logString).not.toContain("cannot read property of undefined");
    expect(logString).not.toContain("[MOCK]");
  });

  it("proves that no transcript text, audio bytes, or [MOCK] labels appear in any log entry", async () => {
    const sensitiveTranscript = "[MOCK] আমার ছেলে রাফি, ০১৭১১২২৩৩৪৪, নীল জামা";
    const { adapter, primary, logs } = setup([sensitiveTranscript]);
    primary.name = "[MOCK] malicious-provider-name";

    const result = await adapter.transcribe(sampleAudio());
    assert(result.ok);
    expect(result.text).toBe(sensitiveTranscript);

    const logString = JSON.stringify(logs);
    expect(logString).not.toContain("[MOCK]");
    expect(logString).not.toContain("রাফি");
    expect(logString).not.toContain("০১৭১১২২৩৩৪৪");
    expect(logString).not.toContain("01711223344");
    expect(logString).not.toContain("নীল জামা");
    expect(logString).not.toContain("audio");
    expect(logString).not.toContain("bytes");

    for (const entry of logs) {
      for (const key of Object.keys(entry)) {
        expect([
          "event",
          "slot",
          "attempt",
          "duration_ms",
          "error_id",
          "err_name",
          "outcome",
          "ok",
        ]).toContain(key);
      }
    }
  });

  it("passes through DispatchRefused without provider failover", async () => {
    const { adapter, dispatch } = setup(
      ["রাফি"],
      ["অন্য"],
      async () => {
        throw new DispatchRefused("E-023");
      },
    );

    const result = await adapter.transcribe(sampleAudio());
    assert(!result.ok);
    expect(result.error.error.id).toBe("E-023");
    expect(dispatch).toHaveBeenCalledOnce();
  });

  it("keeps an unexpected bug distinct when a later fallback is unavailable", async () => {
    const { adapter, logs } = setup(
      [new TypeError("[MOCK] unexpected bug")],
      [new SttFailure(503)],
    );
    const result = await adapter.transcribe(sampleAudio());
    assert(!result.ok);
    expect(result).toMatchObject({ failure: "unexpected", error: { error: { id: "E-021" } } });
    expect(result).not.toHaveProperty("cause");
    expect(logs[0]).toMatchObject({ outcome: "unexpected", error_id: "E-021", err_name: "TypeError" });
  });

  it("treats a malformed provider response as a bug, without inventing an empty transcript", async () => {
    const { adapter } = setup([], undefined, async () => null as unknown as { text: string });
    const result = await adapter.transcribe(sampleAudio());
    assert(!result.ok);
    expect(result).toMatchObject({ failure: "unexpected", error: { error: { id: "E-021" } } });
  });

  it("does not read or leak provider-controlled status, cause, name or code properties", async () => {
    const sensitive = "[MOCK] private provider text";
    const failure = new SttFailure(503);
    Object.defineProperties(failure, {
      status: { get() { throw new Error(sensitive); } },
      cause: { get() { throw new Error(sensitive); } },
      name: { value: sensitive },
      code: { value: sensitive },
    });
    const { adapter, logs } = setup([failure]);
    const result = await adapter.transcribe(sampleAudio());
    assert(!result.ok);
    expect(result).toMatchObject({ failure: "unavailable", error: { error: { id: "E-011" } } });
    expect(result).not.toHaveProperty("cause");
    expect(logs[0]).toMatchObject({ err_name: "SttFailure" });
    expect(JSON.stringify(logs)).not.toContain("[MOCK]");
    expect(logs[0]).not.toHaveProperty("status");
    expect(logs[0]).not.toHaveProperty("err_code");
  });

  it("returns an unexpected result even for a hostile thrown object", async () => {
    const hostile = new Proxy({}, { getPrototypeOf() { throw new Error("[MOCK] private error"); } });
    const { adapter } = setup([], undefined, async () => { throw hostile; });
    const result = await adapter.transcribe(sampleAudio());
    assert(!result.ok);
    expect(result).toMatchObject({ failure: "unexpected", error: { error: { id: "E-021" } } });
  });

  it("uses the default timeout for NaN instead of silently timing out after 1 ms", async () => {
    vi.useFakeTimers();
    const { adapter, primary } = setup([() => new Promise<{ text: string }>(() => {})], undefined, undefined, NaN);
    const pending = adapter.transcribe(sampleAudio());
    const finished = vi.fn();
    void pending.then(finished);
    await vi.advanceTimersByTimeAsync(24_999);
    expect(finished).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toMatchObject({ failure: "timeout", error: { error: { id: "E-014" } } });
    expect(primary.transcribe.mock.calls[0][1].signal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("logs bugs at error level with the default sink", async () => {
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const primary = fakeSttProvider("primary", [new TypeError("[MOCK] private provider message")]);
    const adapter = createSttAdapter({
      primary,
      dispatch: brandSttDispatch((provider, audio, opts) => provider.transcribe(audio, opts)),
    });
    await adapter.transcribe(sampleAudio());
    expect(stderr).not.toHaveBeenCalled();
    const lines = stdout.mock.calls.map(([line]) => JSON.parse(String(line)));
    expect(lines.length).toBeGreaterThan(0);
    expect(lines).toContainEqual(expect.objectContaining({ level: 50, event: "speech.attempt", error_id: "E-021", err_name: "TypeError" }));
    expect(lines.every((line) => !line.dropped?.includes("event"))).toBe(true);
    expect(JSON.stringify(lines)).not.toContain("[MOCK]");
  });

  it.each([
    { step: "[MOCK] synthetic transcript", level: 30, id: undefined },
    { step: "  ", level: 30, id: "E-010" },
    { step: new SttFailure(503), level: 50, id: "E-011" },
    { step: new SttTimeoutError(), level: 40, id: "E-014" },
  ])("uses the catalogue log level $level for $id with the default sink", async ({ step, level, id }) => {
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const adapter = createSttAdapter({
      primary: fakeSttProvider("primary", [step]),
      dispatch: brandSttDispatch((provider, audio, opts) => provider.transcribe(audio, opts)),
    });
    await adapter.transcribe(sampleAudio());
    expect(stderr).not.toHaveBeenCalled();
    const lines = stdout.mock.calls.map(([line]) => JSON.parse(String(line)));
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ event: "speech.attempt", level });
    expect(lines[1]).toMatchObject({ event: "speech.summary", level });
    expect(lines[0].error_id).toBe(id);
    expect(lines[1].error_id).toBe(id);
    expect(JSON.stringify(lines)).not.toContain("[MOCK]");
  });

  it("default sink path writes no stderr line on a normal successful attempt", async () => {
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const primary = fakeSttProvider("primary", ["আমার ছেলে রাফি, বয়স ১৩"]);
    const adapter = createSttAdapter({
      primary,
      dispatch: brandSttDispatch((provider, audio, opts) => provider.transcribe(audio, opts)),
    });
    const result = await adapter.transcribe(sampleAudio());
    assert(result.ok);
    expect(stderr).not.toHaveBeenCalled();
    expect(stdout).toHaveBeenCalled();
  });

  it("a throwing log sink cannot retry or destroy a successful transcription", async () => {
    const stderr = vi.spyOn(console, "error").mockImplementation(() => {});
    const primary = fakeSttProvider("primary", ["[MOCK] synthetic transcript"]);
    const fallback = fakeSttProvider("fallback", ["[MOCK] unused"]);
    const adapter = createSttAdapter({
      primary, fallback,
      dispatch: brandSttDispatch((provider, audio, opts) => provider.transcribe(audio, opts)),
      log() { throw new TypeError("[MOCK] private sink error"); },
    });
    expect(await adapter.transcribe(sampleAudio())).toEqual({ ok: true, text: "[MOCK] synthetic transcript" });
    expect(primary.transcribe).toHaveBeenCalledOnce();
    expect(fallback.transcribe).not.toHaveBeenCalled();
    expect(stderr.mock.calls.map(([line]) => JSON.parse(String(line)))).toEqual([
      { event: "speech.log_failed", failed_event: "speech.attempt" },
      { event: "speech.log_failed", failed_event: "speech.summary" },
    ]);
    expect(String(stderr.mock.calls)).not.toContain("[MOCK]");
  });

  it("stops before fallback if the caller aborts between attempts", async () => {
    const controller = new AbortController();
    const primary = fakeSttProvider("primary", [new SttFailure()]);
    const fallback = fakeSttProvider("fallback", ["[MOCK] unused"]);
    const logs: SttLogEntry[] = [];
    const adapter = createSttAdapter({
      primary, fallback,
      dispatch: brandSttDispatch((provider, audio, opts) => provider.transcribe(audio, opts)),
      log(entry) {
        logs.push(entry);
        if (entry.event === "speech.attempt") controller.abort("[MOCK] private abort reason");
      },
    });
    await expect(adapter.transcribe(sampleAudio(), { signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
    expect(fallback.transcribe).not.toHaveBeenCalled();
    expect(logs.at(-1)).toMatchObject({ event: "speech.summary", outcome: "aborted" });
    expect(JSON.stringify(logs)).not.toContain("[MOCK]");
  });

  it.each(["E-019", "E-023"] as const)("a %s refusal stops before any provider dispatch", async (errorId) => {
    const { adapter, primary, fallback, dispatch, logs } = setup(["[MOCK] unused"], ["[MOCK] unused"], async () => { throw new DispatchRefused(errorId); });
    const result = await adapter.transcribe(sampleAudio());
    expect(result).toMatchObject({ ok: false, error: { error: { id: errorId } } });
    expect(dispatch).toHaveBeenCalledOnce();
    expect(primary.transcribe).not.toHaveBeenCalled();
    expect(fallback?.transcribe).not.toHaveBeenCalled();
    expect(logs.at(-1)).toMatchObject({ error_id: errorId });
  });

  it("aborts a hanging primary at the configured deadline and accepts fallback text", async () => {
    vi.useFakeTimers();
    const hangUntilAborted: ScriptedStep = (_audio, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(new Error("[MOCK] aborted provider")), { once: true });
    });
    const { adapter, primary, fallback, logs } = setup([hangUntilAborted], ["[MOCK] fallback transcript"], undefined, 100);
    const pending = adapter.transcribe(sampleAudio());
    await vi.advanceTimersByTimeAsync(100);
    expect(await pending).toEqual({ ok: true, text: "[MOCK] fallback transcript" });
    expect(primary.transcribe.mock.calls[0][1].signal.aborted).toBe(true);
    expect(fallback?.transcribe).toHaveBeenCalledOnce();
    expect(logs[0]).toMatchObject({ outcome: "timeout", error_id: "E-014" });
    expect(JSON.stringify(logs)).not.toContain("[MOCK]");
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    "",
    "\n\t  ",
    "\u200B\u200C\u200D\u2060",
    "\u200B",
    "\u200C",
    "\u200D",
    "\u2060",
    "  \u200B\u200C\u200D\u2060  ",
  ])("never returns an empty transcript (%j)", async (text) => {
    const { adapter } = setup([text]);
    const result = await adapter.transcribe(sampleAudio());
    expect(result).toMatchObject({ ok: false, error: { error: { id: "E-010" } } });
    expect(result).not.toHaveProperty("text");
  });

  it("handles a synchronous dispatch throw during caller cancellation without an unhandled rejection", async () => {
    const controller = new AbortController();
    const { adapter, dispatch, fallback } = setup([], ["[MOCK] unused"], () => {
      controller.abort("[MOCK] private cancellation");
      throw new TypeError("[MOCK] synchronous dispatch bug");
    });
    await expect(adapter.transcribe(sampleAudio(), { signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
    // Allow Node/Vitest to detect any rejection left behind by cancellation.
    await new Promise((resolve) => setImmediate(resolve));
    expect(dispatch).toHaveBeenCalledOnce();
    expect(fallback?.transcribe).not.toHaveBeenCalled();
  });
});
