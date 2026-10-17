// W4: every S-001/S-002 mount sweeps readable expired drafts, including
// attempted records. Active attempts, corrupt attempted identities and throwing
// storage retain their data. S-003 performs its own read to report expiry.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clientExamples } from "@/contracts/client-examples";
import { acknowledgeNotice, clearIntakeMemory } from "@/lib/intake/handoff";
import { DRAFT_KEY, createDeviceDraft, loadDraft, saveDraft, type DraftStorage } from "@/lib/intake/draft-store";
import { mountHooks } from "./fakes/hook-harness";
import { memoryStorage } from "../intake/review/storage";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("next/link", () => ({
  default: ({ children, href, onClick, ...rest }: { children: unknown; href: string; onClick?: (e: { defaultPrevented: boolean; button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean }) => void }) => {
    void href; void onClick; return { type: "a", props: { ...rest, children } };
  },
}));
vi.mock("react", async (original) => ({ ...await original<typeof import("react")>(), ...(await import("./fakes/hook-harness")).testHooks }));
const { StartButton } = await import("@/app/(parent)/start-button");
const { IntakeChat } = await import("@/app/(parent)/intake/intake-chat");

function stubWindowWith(storage: DraftStorage) {
  vi.stubGlobal("window", Object.assign(new EventTarget(), { localStorage: storage, confirm: () => true }));
  vi.stubGlobal("document", Object.assign(new EventTarget(), { visibilityState: "visible" }));
}

const fixedNow = Date.parse("2026-10-16T12:00:00Z");
function expiredNonAttempted() {
  return { ...createDeviceDraft({ to: "review", sourceText: clientExamples.extractResponse.draft.source_text, response: { ...clientExamples.extractResponse, expires_at: new Date(fixedNow - 60_000).toISOString() }, missing: [], asked: 0, cached: false, mock: true }, fixedNow)!, attempted: false, expiresAt: fixedNow - 60_000 };
}

let storage: ReturnType<typeof memoryStorage>;
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(fixedNow);
  storage = memoryStorage();
  stubWindowWith(storage);
  acknowledgeNotice();
  push.mockClear();
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); clearIntakeMemory(); });

describe("W4: S-001 entry sweep on every mount", () => {
  it("removes an expired non-attempted draft on mount", () => {
    saveDraft(expiredNonAttempted(), storage);
    expect(storage.getItem(DRAFT_KEY)).not.toBeNull();
    const h = mountHooks(() => StartButton({ label: "Start" }));
    h.unmount();
    expect(storage.getItem(DRAFT_KEY)).toBeNull();
  });
  it("keeps an attempted record that has not yet expired on mount", () => {
    const record = { ...createDeviceDraft({ to: "review", sourceText: clientExamples.extractResponse.draft.source_text, response: { ...clientExamples.extractResponse, expires_at: new Date(fixedNow + 60_000).toISOString() }, missing: [], asked: 0, cached: false, mock: true }, fixedNow)!, attempted: true };
    saveDraft(record, storage);
    expect(storage.getItem(DRAFT_KEY)).not.toBeNull();
    const h = mountHooks(() => StartButton({ label: "Start" }));
    h.unmount();
    expect(storage.getItem(DRAFT_KEY)).not.toBeNull();
    const remaining = loadDraft(storage, fixedNow);
    expect(remaining?.client_submission_id).toBe(record.client_submission_id);
    expect(remaining?.attempted).toBe(true);
  });
  it("a cached SPA return re-runs the sweep (re-mount)", () => {
    saveDraft(expiredNonAttempted(), storage);
    const first = mountHooks(() => StartButton({ label: "Start" }));
    first.unmount();
    expect(storage.getItem(DRAFT_KEY)).toBeNull();
    saveDraft(expiredNonAttempted(), storage);
    const second = mountHooks(() => StartButton({ label: "Start" }));
    second.unmount();
    expect(storage.getItem(DRAFT_KEY)).toBeNull();
  });
});

describe("W4: S-002 entry sweep on every mount", () => {
  it("removes an expired non-attempted draft on mount", () => {
    saveDraft(expiredNonAttempted(), storage);
    expect(storage.getItem(DRAFT_KEY)).not.toBeNull();
    const h = mountHooks(() => IntakeChat({ locale: "bn", mode: "fake" }));
    h.unmount();
    expect(storage.getItem(DRAFT_KEY)).toBeNull();
  });
  it("keeps an attempted record that has not yet expired on mount", () => {
    const record = { ...createDeviceDraft({ to: "review", sourceText: clientExamples.extractResponse.draft.source_text, response: { ...clientExamples.extractResponse, expires_at: new Date(fixedNow + 60_000).toISOString() }, missing: [], asked: 0, cached: false, mock: true }, fixedNow)!, attempted: true };
    saveDraft(record, storage);
    expect(storage.getItem(DRAFT_KEY)).not.toBeNull();
    const h = mountHooks(() => IntakeChat({ locale: "bn", mode: "fake" }));
    h.unmount();
    expect(storage.getItem(DRAFT_KEY)).not.toBeNull();
    const remaining = loadDraft(storage, fixedNow);
    expect(remaining?.client_submission_id).toBe(record.client_submission_id);
    expect(remaining?.attempted).toBe(true);
  });
  it("a cached SPA return re-runs the sweep (re-mount)", () => {
    saveDraft(expiredNonAttempted(), storage);
    const first = mountHooks(() => IntakeChat({ locale: "bn", mode: "fake" }));
    first.unmount();
    expect(storage.getItem(DRAFT_KEY)).toBeNull();
    saveDraft(expiredNonAttempted(), storage);
    const second = mountHooks(() => IntakeChat({ locale: "bn", mode: "fake" }));
    second.unmount();
    expect(storage.getItem(DRAFT_KEY)).toBeNull();
  });
});
