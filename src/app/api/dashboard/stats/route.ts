// API-012 GET /api/dashboard/stats (P3-041; TASK-030 part a; FR-019; BR-014;
// TC-012, TC-055). Owner: Masnun.
//
// - Verified officer or admin only; every other role answers E-003 (D2A §9.2
//   table line 1287).
// - All 64 district rows, including zero counts, in the strict response schema
//   (the contract enforces 64 entries once, totals equal the sum of districts,
//   and confirmed_pairs equals referral-recorded found reports).
// - Counts come from `districtStats(db)`: one query, GROUP BYs for missing/found
//   and one pair figure, so a single pair contributes one count to the pair
//   figure (BR-014) and the missing/found categories change separately when
//   only one side moves. The DB test asserts every cell equals an independent
//   SQL GROUP BY over the seeded fixtures.
// - No raw rows, no child payload, no contact, no free text. The strict
//   per-role response schema is the allowlist; a leaked field becomes E-021.
import { dashboardStatsResponseSchema, type DashboardStatsResponse } from "@/contracts";
import { COUNTING_BASIS, toDhakaIso } from "@/contracts";
import { districtStats, totalsOf } from "@/server/dashboard";
import { getPool } from "@/server/db/pool";
import { defineRoute } from "../../_shared";

// Per D2A §5.5: route-level rate limit (one per principal window, well above the
// 1/min a dashboard page would use; document here is fine).
const DASHBOARD_STATS = { id: "dashboard.stats", limit: 60, windowMs: 60_000, scope: "principal", onStoreError: "allow" } as const;

export const runtime = "nodejs"; // pg

export const GET = defineRoute({
  api: "API-012",
  response: dashboardStatsResponseSchema,
  rateLimit: [DASHBOARD_STATS],
  handler: async (): Promise<DashboardStatsResponse> => {
    const districts = await districtStats(getPool());
    if (districts.length !== 64) throw new Error("expected 64 districts");
    return {
      generated_at: toDhakaIso(Date.now()),
      counting_basis: COUNTING_BASIS,
      totals: totalsOf(districts),
      districts,
    };
  },
});
