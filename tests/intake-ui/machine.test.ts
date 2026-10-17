// TASK-021: SCREEN-002 intake state (src/lib/intake/machine.ts).
import { describe, expect, it } from "vitest";
import { errorEnvelope, type ErrorId, type ExtractResponse } from "@/contracts";
import { clientExamples } from "@/contracts/client-examples";
import {
  BUSY_SLOW_MS,
  BUSY_VISIBLE_MS,
  busyStage,
  clock,
  extractBody,
  initialIntakeState,
  intakeReducer,
  nextStep,
  recordingProblem,
  textProblem,
  type IntakeEvent,
  type IntakeState,
} from "@/lib/intake/machine";

const asking: ExtractResponse = clientExamples.extractResponse; // one district question
const done: ExtractResponse = { ...asking, missing_fields: [], next_question: null };
const stuck: ExtractResponse = { ...asking, next_question: null }; // fields missing, no question
const REPORT = "আমার মেয়ে মিতু, বয়স ৭ বছর, গতকাল বিকেলে হারিয়ে গেছে।";

const play = (s: IntakeState, ...events: IntakeEvent[]) => events.reduce(intakeReducer, s);
const fail = (id: Exclude<ErrorId, "E-007">): IntakeEvent => ({ type: "failed", error: errorEnvelope(id) });
const ready = () => initialIntakeState(true);

describe("provider notice gate (BR-004)", () => {
  it("starts in notice until acknowledged, and ignores capture events there", () => {
    const s = initialIntakeState(false);
    expect(s.phase).toBe("notice");
    expect(play(s, { type: "extract", text: REPORT }, { type: "transcribe" })).toEqual(s);
    expect(play(s, { type: "acknowledge" }).phase).toBe("compose");
  });
});

describe("text and answers", () => {
  it("sends text first, then answers with the device-held draft, token and revision", () => {
    expect(extractBody(ready(), REPORT)).toEqual({ kind: "missing", text: REPORT });
    const withToken = play(ready(), { type: "transcribed", data: clientExamples.transcribeResponse });
    expect(extractBody(withToken, REPORT)).toEqual({ kind: "missing", text: REPORT, draft_token: clientExamples.transcribeResponse.draft_token });
    const s = play(ready(), { type: "extract", text: REPORT }, { type: "extracted", data: asking });
    expect(extractBody(s, "ঢাকা")).toEqual({
      kind: "missing",
      answer: "ঢাকা",
      draft: asking.draft,
      draft_token: asking.draft_token,
      draft_revision: asking.draft_revision,
    });
  });

  it("checks length on send: 20 code points for a report, non-empty for an answer", () => {
    expect(textProblem("   short   ", false)).toBe("short");
    expect(textProblem("১".repeat(19), false)).toBe("short");
    expect(textProblem("১".repeat(20), false)).toBeNull();
    expect(textProblem("  ", true)).toBe("empty");
    expect(textProblem("ঢাকা", true)).toBeNull();
  });

  it("tracks the parent bubble: sending, then sent or error, then sending again on retry", () => {
    let s = play(ready(), { type: "extract", text: REPORT });
    expect(s.busy).toBe("extracting");
    expect(s.messages).toEqual([{ id: 1, from: "parent", text: REPORT, status: "sending" }]);
    s = play(s, fail("E-021"));
    expect(s.messages[0]).toMatchObject({ status: "error" });
    expect(s.busy).toBeNull();
    s = play(s, { type: "retry", busy: "extracting" });
    expect(s.messages[0]).toMatchObject({ status: "sending" });
    expect(s.messages).toHaveLength(1); // a retry never duplicates the message
    s = play(s, { type: "extracted", data: done });
    expect(s.messages[0]).toMatchObject({ status: "sent" });
  });

  it("ignores a second send while one is in flight", () => {
    const s = play(ready(), { type: "extract", text: REPORT });
    expect(play(s, { type: "extract", text: REPORT })).toBe(s);
    expect(play(s, { type: "transcribe" })).toBe(s);
  });
});

describe("follow-up questions (BR-023: at most four)", () => {
  it("asks the server's question and shows it as a Fera bubble", () => {
    const s = play(ready(), { type: "extract", text: REPORT }, { type: "extracted", data: asking });
    expect(s.phase).toBe("question");
    expect(s.asked).toBe(1);
    expect(s.question).toEqual(asking.next_question);
    expect(s.messages.at(-1)).toEqual({ id: 2, from: "fera", question: asking.next_question, n: 1 });
    expect(s.latest).toBe(asking);
    expect(s.text).toBe("");
  });

  it("never shows a fifth question; the form takes over with the draft kept", () => {
    let s = play(ready(), { type: "extract", text: REPORT }, { type: "extracted", data: asking });
    for (let i = 0; i < 3; i++) s = play(s, { type: "extract", text: "জানি না" }, { type: "extracted", data: asking });
    expect(s.asked).toBe(4);
    expect(s.phase).toBe("question");
    s = play(s, { type: "extract", text: "জানি না" }, { type: "extracted", data: asking });
    expect(s.phase).toBe("manual");
    expect(s.asked).toBe(4);
    expect(s.question).toBeNull();
    expect(s.messages.filter((m) => m.from === "fera")).toHaveLength(4);
    expect(s.latest).toBe(asking);
  });

  it("nextStep: complete only with nothing missing; missing without a question → form", () => {
    expect(nextStep(done, 0)).toBe("complete");
    expect(nextStep(asking, 3)).toBe("question");
    expect(nextStep(asking, 4)).toBe("manual");
    expect(nextStep(stuck, 0)).toBe("manual");
    expect(play(ready(), { type: "extract", text: REPORT }, { type: "extracted", data: done }).phase).toBe("complete");
  });
});

describe("voice", () => {
  it("puts the transcript in the editable box and keeps its token", () => {
    const s = play(ready(), { type: "transcribe" }, { type: "transcribed", data: clientExamples.transcribeResponse });
    expect(s).toMatchObject({ busy: null, heard: true, text: clientExamples.transcribeResponse.transcript, token: clientExamples.transcribeResponse.draft_token });
    expect(play(s, { type: "edit", text: "ঠিক করা লেখা" })).toMatchObject({ text: "ঠিক করা লেখা", heard: true });
  });

  it("checks a recording on the device: 5 s minimum, 2 MB maximum (D-002)", () => {
    expect(recordingProblem(4.9, 1000)).toBe("E-009");
    expect(recordingProblem(38, 0)).toBe("E-009");
    expect(recordingProblem(38, 2 * 1024 * 1024 + 1)).toBe("E-008");
    expect(recordingProblem(5, 1000)).toBeNull();
    expect(recordingProblem(120, 2 * 1024 * 1024)).toBeNull();
  });

  it("formats the D4 timer", () => {
    expect(`${clock(38.9)} / ${clock(120)}`).toBe("0:38 / 2:00");
    expect(clock(-1)).toBe("0:00");
  });
});

describe("error states (D3 SCREEN-002, §7)", () => {
  const extracting = () => play(ready(), { type: "extract", text: REPORT });

  it.each(["E-012", "E-013", "E-023"] as const)("%s hands off to the manual form", (id) => {
    const s = play(extracting(), fail(id));
    expect(s.phase).toBe("manual");
    expect(s.error?.error.id).toBe(id);
  });

  it("E-014 allows one retry, the second goes to the form", () => {
    let s = play(extracting(), fail("E-014"));
    expect(s.phase).toBe("compose");
    expect(s.timeouts).toBe(1);
    s = play(s, { type: "retry", busy: "extracting" }, fail("E-014"));
    expect(s.phase).toBe("manual");
  });

  it.each(["E-022", "E-011"] as const)("%s switches voice off and keeps the text path", (id) => {
    const s = play(ready(), fail(id));
    expect(s.voiceOff).toBe(id);
    expect(s.phase).toBe("compose");
  });

  it("E-019 clears the expired draft but keeps the notice acknowledged", () => {
    const s = play(ready(), { type: "extract", text: REPORT }, { type: "extracted", data: asking }, fail("E-019"));
    expect(s).toMatchObject({ phase: "compose", latest: null, token: null, asked: 0, messages: [] });
    expect(s.error?.error.id).toBe("E-019");
  });

  it.each(["E-001", "E-008", "E-009", "E-010", "E-015", "E-021", "E-024"] as const)("%s stays on the screen with the text kept", (id) => {
    const s = play(ready(), { type: "edit", text: REPORT }, fail(id));
    expect(s).toMatchObject({ phase: "compose", busy: null, text: REPORT });
    expect(s.error?.error.id).toBe(id);
  });

  it("E-007 keeps the server's seconds in the message", () => {
    const s = play(extracting(), { type: "failed", error: errorEnvelope("E-007", { seconds: 42 }) });
    expect(s.error?.error.message_bn).toContain("৪২");
    expect(s.error?.error.retryable).toBe(true);
  });

  it("a new send clears the last error", () => {
    const s = play(ready(), fail("E-010"), { type: "extract", text: REPORT });
    expect(s.error).toBeNull();
  });
});

describe("loading stages (COMP-046)", () => {
  it("is quiet under 300 ms, shows the verb, then 'still working' from 10 s", () => {
    expect(busyStage(BUSY_VISIBLE_MS - 1)).toBe("quiet");
    expect(busyStage(BUSY_VISIBLE_MS)).toBe("working");
    expect(busyStage(BUSY_SLOW_MS - 1)).toBe("working");
    expect(busyStage(BUSY_SLOW_MS)).toBe("slow");
  });

  it("marks cached replies (COMP-048)", () => {
    const s = play(ready(), { type: "extract", text: REPORT }, { type: "extracted", data: { ...done, cached: true } });
    expect(s.cached).toBe(true);
    expect(play(s, { type: "reset" }).cached).toBe(false);
  });
});
