// API-001 POST /api/intake/transcribe (TASK-014, FR-002, BR-023, TC-001/060/061).
// Multipart audio → editable Bangla transcript. The handler fails closed E-001
// on parse issues, E-008 on oversize audio, E-009 on duration out of range,
// E-010 on empty/garbled transcript, E-011 on provider outage, E-013/E-023 on
// budget. The route factory is built by `./deps` so tests can swap in their
// own orchestrator dependencies.
import { getIntakeRouteDeps } from "../deps";

export const runtime = "nodejs";
export const maxDuration = 30; // above the 25 s provider timeout

export const POST = getIntakeRouteDeps().transcribe;
