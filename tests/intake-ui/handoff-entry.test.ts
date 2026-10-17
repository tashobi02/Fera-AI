import { afterEach, expect, it, vi } from "vitest";
import { DRAFT_KEY } from "@/lib/intake/draft-store";
import { memoryStorage } from "../intake/review/storage";
afterEach(() => vi.unstubAllGlobals());
it("loading the handoff module leaves review expiry for the route restore to report", async () => {
  const storage = memoryStorage(); const raw = JSON.stringify({ expired: true });
  storage.setItem(DRAFT_KEY, raw);
  vi.stubGlobal("window", { localStorage: storage });
  vi.resetModules(); await import("@/lib/intake/handoff");
  expect(storage.getItem(DRAFT_KEY)).toBe(raw);
});
