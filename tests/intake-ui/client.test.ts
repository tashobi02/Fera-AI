// TASK-021: IntakeClient seam (src/lib/intake/client.ts) and the typed fake.
import { describe, expect, it, vi } from "vitest";
import { errorEnvelope, extractResponseSchema } from "@/contracts";
import { clientExamples } from "@/contracts/client-examples";
import {
  AUDIO_PART,
  EXTRACT_API,
  TRANSCRIBE_API,
  createHttpIntakeClient,
  durationField,
  noticeGated,
  type IntakeClient,
} from "@/lib/intake/client";
import { createFakeIntakeClient, fakeExtract } from "@/lib/intake/fakes/fake-client";

const signal = () => new AbortController().signal;
const audio = () => new Blob([new Uint8Array(1000)], { type: "audio/webm" });
const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

function spyClient(): IntakeClient & { transcribe: ReturnType<typeof vi.fn>; extract: ReturnType<typeof vi.fn> } {
  return {
    mock: true,
    transcribe: vi.fn(async () => ({ ok: true as const, data: clientExamples.transcribeResponse })),
    extract: vi.fn(async () => ({ ok: true as const, data: clientExamples.extractResponse })),
  };
}

describe("provider notice gate (BR-004, FR-007, TC-060)", () => {
  it("never calls the client before the notice is acknowledged", async () => {
    const inner = spyClient();
    let acknowledged = false;
    const gated = noticeGated(inner, () => acknowledged);
    await expect(gated.extract(clientExamples.extractRequest, signal())).rejects.toThrow(/notice/);
    await expect(gated.transcribe({ audio: audio(), durationS: 38 }, signal())).rejects.toThrow(/notice/);
    expect(inner.extract).not.toHaveBeenCalled();
    expect(inner.transcribe).not.toHaveBeenCalled();

    acknowledged = true;
    await expect(gated.extract(clientExamples.extractRequest, signal())).resolves.toMatchObject({ ok: true });
    expect(inner.extract).toHaveBeenCalledTimes(1);
    expect(gated.mock).toBe(true);
  });
});

describe("HTTP client (D2A API-001/002)", () => {
  it("posts multipart audio to API-001 with kind, duration and token", async () => {
    const fetchImpl = vi.fn(async () => json(200, clientExamples.transcribeResponse));
    const result = await createHttpIntakeClient(fetchImpl).transcribe({ audio: audio(), durationS: 38.44, draftToken: "syn.draft.v1.abcdefghijklmnop" }, signal());
    expect(result).toEqual({ ok: true, data: clientExamples.transcribeResponse });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(TRANSCRIBE_API);
    expect(init).toMatchObject({ method: "POST", credentials: "same-origin", cache: "no-store" });
    const form = init.body as FormData;
    expect(form.get("kind")).toBe("missing");
    expect(form.get("duration_s")).toBe("38.4");
    expect(form.get("draft_token")).toBe("syn.draft.v1.abcdefghijklmnop");
    expect(form.get(AUDIO_PART)).toBeInstanceOf(Blob);
  });

  it("posts JSON to API-002 and parses the strict response", async () => {
    const fetchImpl = vi.fn(async () => json(200, clientExamples.extractResponse));
    const result = await createHttpIntakeClient(fetchImpl).extract(clientExamples.extractRequest, signal());
    expect(result).toEqual({ ok: true, data: clientExamples.extractResponse });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(EXTRACT_API);
    expect(JSON.parse(init.body as string)).toEqual(clientExamples.extractRequest);
  });

  it("passes a valid error envelope through and maps everything else to the catalogue", async () => {
    const http = (res: Response) => createHttpIntakeClient(async () => res).extract(clientExamples.extractRequest, signal());
    expect(await http(json(422, errorEnvelope("E-015")))).toEqual({ ok: false, error: errorEnvelope("E-015") });
    expect(await http(json(429, { nope: true }, { "retry-after": "42" }))).toEqual({ ok: false, error: errorEnvelope("E-007", { seconds: 42 }) });
    expect(await http(json(504, "gateway"))).toMatchObject({ ok: false, error: { error: { id: "E-014" } } });
    expect(await http(json(500, "<html>"))).toMatchObject({ ok: false, error: { error: { id: "E-021" } } });
    // A 2xx that breaks the strict schema is not shown to the parent.
    expect(await http(json(200, { ...clientExamples.extractResponse, extra: 1 }))).toMatchObject({ ok: false, error: { error: { id: "E-021" } } });
  });

  it("maps a network failure to E-024 and our 25 s abort to E-014", async () => {
    const down = createHttpIntakeClient(async () => {
      throw new TypeError("Failed to fetch");
    });
    expect(await down.extract(clientExamples.extractRequest, signal())).toMatchObject({ ok: false, error: { error: { id: "E-024" } } });
    const controller = new AbortController();
    controller.abort();
    expect(await down.extract(clientExamples.extractRequest, controller.signal)).toMatchObject({ ok: false, error: { error: { id: "E-014" } } });
  });

  it("formats duration_s within 5–120 s for the schema", () => {
    expect(durationField(38.44)).toBe("38.4");
    expect(durationField(130)).toBe("120.0");
  });

  it.each([
    [413, "E-008", "E-008"], [401, "E-002", "E-002"],
    [503, "E-013", "E-011"], [422, "E-012", "E-010"],
    [200, "E-021", "E-021"],
  ])("maps non-JSON status %s per endpoint", async (status, extractId, transcribeId) => {
    const http = createHttpIntakeClient(async () => new Response("<html>platform response</html>", { status }));
    expect(await http.extract(clientExamples.extractRequest, signal())).toMatchObject({ ok: false, error: { error: { id: extractId } } });
    expect(await http.transcribe({ audio: audio(), durationS: 30 }, signal())).toMatchObject({ ok: false, error: { error: { id: transcribeId } } });
  });
});

describe("unreadable successful replies leave a trace without content (W6)", () => {
  it("logs only error names for malformed JSON and schema failures", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const bad = createHttpIntakeClient(async () => new Response("{not json secret-text", { status: 200 }));
    expect(await bad.extract(clientExamples.extractRequest, signal())).toMatchObject({ ok: false, error: { error: { id: "E-021" } } });
    const wrong = createHttpIntakeClient(async () => json(200, { draft: { source_text: "secret-text" } }));
    expect(await wrong.extract(clientExamples.extractRequest, signal())).toMatchObject({ ok: false, error: { error: { id: "E-021" } } });
    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).toContain("SyntaxError");
    expect(logged).toContain("ZodError");
    expect(logged).not.toContain("draft");
    expect(logged).not.toContain("secret-text");
    warn.mockRestore();
  });
});

describe("typed fake (until TASK-014/020)", () => {
  const fake = createFakeIntakeClient({ delayMs: 0 });

  it("is labelled mock, returns schema-valid extraction and refuses to invent speech", async () => {
    expect(fake.mock).toBe(true);
    const heard = await fake.transcribe({ audio: audio(), durationS: 38 }, signal());
    expect(heard).toEqual({ ok: false, error: errorEnvelope("E-011") });
    const first = await fake.extract({ kind: "missing", text: "আমার মেয়ে নুসরাত, বয়স ৭ বছর।" }, signal());
    expect(first.ok && first.data.next_question?.field).toBe("event.district_code");
  });

  it("does not put a free-text place answer into the district field", async () => {
    const first = fakeExtract({ kind: "missing", text: "আমার মেয়ে নুসরাত, বয়স ৭ বছর।" }, 1);
    const res = await fake.extract({ kind: "missing", draft: first.draft, draft_token: first.draft_token, draft_revision: 1, answer: "মিরপুর, ঢাকা" }, signal());
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(extractResponseSchema.parse(res.data)).toBeTruthy();
    expect(res.data.missing_fields).toContain("event.district_code");
    expect(res.data.draft.event.district_text).toBeNull();
    expect(res.data.draft.event.district_code).toBeNull();
  });

  it("understands only the typed name and stated sex; every other value stays unknown", () => {
    const text = "আমার মেয়ে নুসরাত";
    const { draft } = fakeExtract({ kind: "missing", text }, 1);
    expect(draft.child).toEqual({ name: "নুসরাত", name_latin: null, sex: "female", age_years: null, age_min: null, age_max: null, height_cm: null, clothing: null, marks: null });
    expect(draft.event).toEqual({ at: null, at_approx: false, at_lower: null, at_upper: null, place_text: null, district_text: null, district_code: null, thana: null, circumstances: null });
    expect(draft.reporter).toEqual({ phone: null, relation: null });
    expect(Object.keys(draft.evidence).sort()).toEqual(["child.name", "child.sex"]);
    for (const evidence of Object.values(draft.evidence)) {
      expect(text.slice(evidence.start_utf16, evidence.end_utf16)).toBe(evidence.quote);
    }
  });

  it("does not turn relative time words into an invented timestamp or clothing", () => {
    const { draft } = fakeExtract({ kind: "missing", text: "আজ সকালে আমার ছেলে রফিক হারিয়ে গেছে।" }, 1);
    expect(draft.event.at).toBeNull();
    expect(draft.event.at_lower).toBeNull();
    expect(draft.event.at_upper).toBeNull();
    expect(draft.child.clothing).toBeNull();
    expect(draft.reporter.phone).toBeNull();
  });

  it.each(["আমার মেয়ে হারিয়ে গেছে", "আমার মেয়ে ঢাকায় থাকে", "my daughter went missing", "my son is missing"])("does not guess a name from a descriptive phrase: %s", (text) => {
    const { draft } = fakeExtract({ kind: "missing", text }, 1);
    expect(draft.child.name).toBeNull();
    expect(draft.child.name_latin).toBeNull();
  });

  it("leaves an oversized Bangla name unknown without slicing a conjunct", () => {
    const { draft } = fakeExtract({ kind: "missing", text: `আমার মেয়ে ${"ক".repeat(79)}ক্ষমা` }, 1);
    expect(draft.child.name).toBeNull();
    expect(draft.evidence["child.name"]).toBeUndefined();
  });

  it.each(["বয়স ৭ মাস", "বয়স ১১৭", "বয়স ৭ থেকে ৯ বছর", "বয়স ৭–৯ বছর", "age 7.5 years"])("leaves unsupported age units/ranges/numbers unknown: %s", (text) => {
    const { draft } = fakeExtract({ kind: "missing", text }, 1);
    expect([draft.child.age_years, draft.child.age_min, draft.child.age_max]).toEqual([null, null, null]);
  });

  it("does not extract an 11-digit phone substring from a longer number", () => {
    const { draft } = fakeExtract({ kind: "missing", text: "নম্বর ০১৭০০০০০০০১২৩" }, 1);
    expect(draft.reporter.phone).toBeNull();
  });

  it("hands accumulated source overflow to the manual form without truncating text", async () => {
    const first = fakeExtract({ kind: "missing", text: "ক".repeat(3999) }, 1);
    const result = await createFakeIntakeClient({ delayMs: 0 }).extract({ kind: "missing", draft: first.draft, draft_token: first.draft_token, draft_revision: 1, answer: "ক্ষমা" }, signal());
    expect(result).toEqual({ ok: false, error: errorEnvelope("E-012") });
  });

  it("has a valid evidence span for every known value, including exact age bounds", () => {
    const { draft } = fakeExtract({ kind: "missing", text: "আমার ছেলে রফিক, বয়স ৭, আমার ফোন নম্বর ০১৭০০০০০০০১" }, 1);
    for (const path of ["child.name", "child.sex", "child.age_years", "child.age_min", "child.age_max", "reporter.phone"]) {
      const evidence = draft.evidence[path as keyof typeof draft.evidence];
      expect(evidence, path).toBeDefined();
      expect(draft.source_text.slice(evidence!.start_utf16, evidence!.end_utf16)).toBe(evidence!.quote);
    }
  });

  it("stops on abort with E-014", async () => {
    const controller = new AbortController();
    controller.abort();
    expect(await createFakeIntakeClient().extract(clientExamples.extractRequest, controller.signal)).toMatchObject({
      ok: false,
      error: { error: { id: "E-014" } },
    });
  });
});
