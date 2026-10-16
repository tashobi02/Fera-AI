// TASK-063: injected synthetic billing only; no real rate/provider/model claim.
import { estimateUpperUsd } from "@/server/spend/price-sheet";

export function mockEstimate(upperUsd = "0.100000") {
  return estimateUpperUsd({ status: "injected", entries: [{
    id: "mock-spend", provider: "[MOCK]", model: "[MOCK]", operation: "transcribe", usdPerMinute: upperUsd,
  }] }, { priceId: "mock-spend", operation: "transcribe", maxBillableSeconds: 60 });
}
