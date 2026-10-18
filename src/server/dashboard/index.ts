// Dashboard server module (P3-041; TASK-030 part a; API-012/022; FR-019; BR-014;
// TC-012, TC-055). Owner: Masnun. Server-only.
//
// - districtStats(db) returns counts per district straight from SQL (one GROUP BY
//   per kind+state plus one for confirmed pairs). One confirmed pair counts once
//   in the pair figure; missing and found categories change separately (BR-014).
// - listCasesForDistrict(db, query) returns the officer drill-through rows for
//   API-022 and the admin metadata rows, with cursor pagination (TC-012).
// - All amounts are derived inside SQL; tests assert equality with independent
//   SQL GROUP BYs over the seeded fixtures.
//
// Module-load types only. The route layer applies role guards, Zod input, and the
// strict per-role response schema. No I/O happens at import time.
export { districtStats, listCasesForDistrict, decodeDistrictRow, decodeCaseListRow, totalsOf, type CaseListRow, type CountCells, type DistrictCountRow, type CaseListQuery, type CaseListResult } from "./stats";
