// API-002 POST /api/intake/extract (TASK-020, FR-003/004/005, BR-023, TC-002/003/043).
// JSON body: text (new) or answer + draft + draft_token + draft_revision
// (continuation). The orchestrator never stores a child payload before
// confirmation; the route fails closed E-001 on parse issues, E-005 on stale
// revision, E-013/E-023 on budget exhaustion, E-019 on expired draft.
import { getIntakeRouteDeps } from "../deps";

export const runtime = "nodejs";
export const maxDuration = 30; // above the 25 s provider timeout

export const POST = getIntakeRouteDeps().extract;
