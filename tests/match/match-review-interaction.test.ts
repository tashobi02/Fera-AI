// TASK-028 audit follow-ups on SCREEN-010: controls stay disabled after a stale or lost reply
// until the stored state is reloaded, and the reject-reason error clears on input. Hook harness, no DOM.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { exampleCandidateDecisionView } from "@/contracts/examples";
import { locales } from "@/locales";
import { button, click, elements, mountHooks, settle } from "../intake-ui/fakes/hook-harness";

vi.mock("react", async (original) => ({ ...(await original<typeof import("react")>()), ...(await import("../intake-ui/fakes/hook-harness")).testHooks }));
const { MatchReview } = await import("@/app/(desk)/officer/match/[id]/match-review");
const view = exampleCandidateDecisionView;
const t = locales.en;

const mount = () => mountHooks(() => MatchReview({ view, locale: "en", queueHref: "/officer/queue" }));

beforeEach(() => {
  vi.stubGlobal("window", Object.assign(new EventTarget(), { location: { reload: vi.fn() } }));
});
afterEach(() => vi.unstubAllGlobals());

async function confirmWith(status: number, error: string) {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { id: error, message: "x", request_id: "r" } }), { status, headers: { "content-type": "application/json" } })));
  const h = mount();
  click(button(h.tree, t.matchReviewConfirm));
  h.render();
  for (const box of elements(h.tree).filter((n) => n.props.type === "checkbox")) {
    (box.props.onChange as (e: { target: { checked: boolean } }) => void)({ target: { checked: true } });
    h.render();
  }
  click(button(h.tree, t.matchReviewConfirmFinal));
  await settle();
  h.render();
  return h;
}

describe("decision controls after a failed decision", () => {
  it.each([["stale", 409, "E-005"], ["uncertain", 500, "E-021"]] as const)("stay disabled after %s until reload", async (_kind, status, error) => {
    const h = await confirmWith(status, error);
    expect(button(h.tree, t.matchReviewConfirm).props.disabled).toBe(true);
    expect(button(h.tree, t.matchReviewReject).props.disabled).toBe(true);
    expect(elements(h.tree).find((n) => n.type === "textarea" && String(n.props.id).endsWith("-reason"))?.props.disabled).toBe(true);
    expect(button(h.tree, t.matchReviewReload)).toBeTruthy();
    // the disabled controls point at the message that explains why
    const msg = elements(h.tree).find((n) => n.type === "p" && typeof n.props.id === "string" && String(n.props.id).endsWith("-failure"))!;
    expect(msg).toBeTruthy();
    const reason = elements(h.tree).find((n) => n.type === "textarea" && String(n.props.id).endsWith("-reason"))!;
    for (const node of [button(h.tree, t.matchReviewConfirm), button(h.tree, t.matchReviewReject), reason]) {
      expect(String(node.props["aria-describedby"] ?? "")).toContain(String(msg.props.id));
    }
  });

  it("stay live after a rate limit (the decision was not attempted)", async () => {
    const h = await confirmWith(429, "E-007");
    expect(button(h.tree, t.matchReviewConfirm).props.disabled).toBe(false);
    expect(button(h.tree, t.matchReviewReject).props.disabled).toBe(false);
  });
});

describe("reject reason error", () => {
  it("clears as soon as the officer types", () => {
    const h = mount();
    click(button(h.tree, t.matchReviewReject));
    h.render();
    const reason = () => elements(h.tree).find((n) => n.type === "textarea" && String(n.props.id).endsWith("-reason"))!;
    expect(reason().props["aria-invalid"]).toBe(true);
    (reason().props.onChange as () => void)();
    h.render();
    expect(reason().props["aria-invalid"]).toBeUndefined();
  });
});
