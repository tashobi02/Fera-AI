import type { FormEvent, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { errorEnvelope } from "@/contracts";
import { clientExamples } from "@/contracts/client-examples";
import { EDIT_DRAFT_KEY, loadEditDraft } from "@/lib/intake/edit-draft-store";
import { beginEditMode, clearEditMode, readEditMode } from "@/lib/intake/edit-handoff";
import { content, elements, mountHooks, settle } from "./fakes/hook-harness";
import { memoryStorage } from "../intake/review/storage";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("react", async (original) => ({ ...await original<typeof import("react")>(), ...(await import("./fakes/hook-harness")).testHooks }));
const { EditModeScreen } = await import("@/app/(parent)/intake/review/edit-mode-screen");
const { ReviewFields, ConfirmBar } = await import("@/app/(parent)/intake/review/review-fields");

const CASE_ID = clientExamples.ownerCaseView.id;
const REF_CODE = clientExamples.ownerCaseView.ref_code;
const node = (tree: ReactNode, type: unknown) => elements(tree).find((part) => part.type === type)!;
const view = () => structuredClone(clientExamples.ownerCaseView);
let storage: ReturnType<typeof memoryStorage>;

beforeEach(() => {
  storage = memoryStorage();
  vi.stubGlobal("window", { localStorage: storage, confirm: () => true });
  vi.stubGlobal("document", { getElementById: () => null });
  push.mockClear();
});
afterEach(() => {
  clearEditMode(storage);
  vi.unstubAllGlobals();
});

describe("ACT017 parent edit handoff", () => {
  it("keeps a valid pointer when the status card has no version", () => {
    expect(beginEditMode({ caseId: CASE_ID, refCode: REF_CODE }, storage, 1_700_000_000_000)).toBe(true);
    expect(readEditMode(storage, 1_700_000_000_000)).toMatchObject({ caseId: CASE_ID, refCode: REF_CODE, expectedVersion: 0 });
  });

  it("reads API-004, requires the review checkbox, then PATCHes API-005 and clears local edit state", async () => {
    expect(beginEditMode({ caseId: CASE_ID, refCode: REF_CODE }, storage)).toBe(true);
    const latest = { ...view(), version: 2 };
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) =>
      init?.method === "PATCH" ? Response.json(latest) : Response.json(view()),
    );
    vi.stubGlobal("fetch", fetcher as typeof fetch);

    const h = mountHooks(() => EditModeScreen({ locale: "en" }));
    await settle();
    h.render();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[1]?.method).toBe("GET");

    const edit = node(h.tree, ReviewFields);
    (edit.props.onEdit as (path: "child.clothing", value: string) => void)("child.clothing", "parent's corrected detail");
    h.render();
    const form = node(h.tree, "form");
    (form.props.onSubmit as (event: FormEvent) => void)({ preventDefault() {} } as FormEvent);
    h.render();
    expect(fetcher).toHaveBeenCalledTimes(1);

    (node(h.tree, ConfirmBar).props.onCheck as (checked: boolean) => void)(true);
    h.render();
    (node(h.tree, "form").props.onSubmit as (event: FormEvent) => void)({ preventDefault() {} } as FormEvent);
    await settle();
    h.render();

    const requests = fetcher.mock.calls.map(([url, init]) => ({ url: String(url), init }));
    expect(requests.map(({ init }) => init?.method)).toEqual(["GET", "PATCH"]);
    expect(requests[1]?.url).toBe(`/api/cases/${CASE_ID}`);
    expect(new Headers(requests[1]?.init?.headers).get("x-fera-provider-notice")).toBe("v1");
    expect(JSON.parse(requests[1]?.init?.body as string)).toMatchObject({ confirmed: true, expected_version: 1, draft: { child: { clothing: "parent's corrected detail" } } });
    expect(push).toHaveBeenCalledWith("/status");
    expect(storage.getItem("fera.intake.edit-mode.v1")).toBeNull();
    expect(storage.getItem(EDIT_DRAFT_KEY)).toBeNull();
    expect(content(h.tree)).toContain("Correction submitted");
  });

  it("retains the corrected device draft and shows stale-version copy after E-005", async () => {
    expect(beginEditMode({ caseId: CASE_ID, refCode: REF_CODE }, storage)).toBe(true);
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) =>
      init?.method === "PATCH"
        ? Response.json(errorEnvelope("E-005"), { status: 409 })
        : Response.json(view()),
    );
    vi.stubGlobal("fetch", fetcher as typeof fetch);
    const h = mountHooks(() => EditModeScreen({ locale: "en" }));
    await settle();
    h.render();
    (node(h.tree, ReviewFields).props.onEdit as (path: "child.clothing", value: string) => void)("child.clothing", "kept on this device");
    h.render();
    (node(h.tree, ConfirmBar).props.onCheck as (checked: boolean) => void)(true);
    h.render();
    (node(h.tree, "form").props.onSubmit as (event: FormEvent) => void)({ preventDefault() {} } as FormEvent);
    await settle();
    h.render();

    expect(content(h.tree)).toContain("This report's details changed");
    expect(push).not.toHaveBeenCalled();
    expect(fetcher.mock.calls.map(([, init]) => init?.method)).toEqual(["GET", "PATCH"]);
    expect(loadEditDraft(storage)).toMatchObject({ caseId: CASE_ID, expectedVersion: 1, edits: { "child.clothing": "kept on this device" }, attempted: true });
  });
});
