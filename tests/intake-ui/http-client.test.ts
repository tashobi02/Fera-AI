import { afterEach, describe, expect, it, vi } from "vitest";
import { clientExamples } from "@/contracts/client-examples";
import { createHttpIntakeClient, EXTRACT_API, noticeGated } from "@/lib/intake/client";
import { acknowledgeNotice, clearIntakeMemory, noticeAcknowledged } from "@/lib/intake/handoff";

describe("live intake HTTP default and notice acknowledgement", () => {
  afterEach(() => {
    clearIntakeMemory();
    vi.unstubAllGlobals();
  });

  it("does not dispatch before the displayed notice is acknowledged, then sends notice v1", async () => {
    const fetcher = vi.fn(async () => Response.json(clientExamples.extractResponse));
    vi.stubGlobal("fetch", fetcher);
    const live = createHttpIntakeClient();
    const gated = noticeGated(live, noticeAcknowledged);
    const signal = new AbortController().signal;

    expect(live.mock).toBe(false);
    await expect(gated.extract(clientExamples.extractRequest, signal)).rejects.toThrow(/notice/);
    expect(fetcher).not.toHaveBeenCalled();

    acknowledgeNotice();
    await expect(gated.extract(clientExamples.extractRequest, signal)).resolves.toMatchObject({ ok: true });
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(EXTRACT_API);
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("x-fera-provider-notice")).toBe("v1");
  });
});
