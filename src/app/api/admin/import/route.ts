// API-015 POST /api/admin/import (TASK-048; SCREEN-013 ACT-026; D2A API-015;
// FR-024, TC-014). Admin only; synthetic fixtures only; counts-only response.
//
// The route is built here (not from src/app/api/admin/admin-routes.ts) so the
// other admin routes are unchanged. The shared API layer still owns the role
// guard, the same-origin check, the body cap (LIMITS.importBodyBytes) and the
// strict response schema.
import {
  LIMITS,
  importRequestSchema,
  importResponseSchema,
  type ImportRequest,
  type ImportResponse,
} from "@/contracts";
import { importSyntheticCases, type ImportServiceOptions } from "@/server/import";
import {
  RATE_LIMITS,
  Reply,
  defineRoute,
  type DefineRoute,
} from "../../_shared";

export const runtime = "nodejs"; // pg

export type ImportService = (
  principal: Parameters<typeof importSyntheticCases>[0],
  input: ImportRequest,
  opts: ImportServiceOptions,
) => Promise<ImportResponse>;

const defaultService: ImportService = (principal, input, opts) =>
  importSyntheticCases(principal, input, opts);

// D6 §TC-014 expects synthetic fixtures only: 5 texts, one containing the
// "ignore previous instructions" string, each with an example.invalid URL. The
// rate limit is the same network limit the other admin writes use; the
// per-principal limit guards against an admin flooding the import queue.
const IMPORT_WRITES = { id: "admin.import", limit: 6, windowMs: 60_000, scope: "principal", onStoreError: "allow" } as const;

export function importRoute(
  defineRoute: DefineRoute,
  service: ImportService = defaultService,
) {
  return defineRoute({
    api: "API-015",
    body: importRequestSchema,
    maxBodyBytes: LIMITS.importBodyBytes,
    response: importResponseSchema,
    rateLimit: [IMPORT_WRITES, RATE_LIMITS.adminRedaction],
    handler: async ({ principal, body }): Promise<Reply<ImportResponse>> => {
      const result = await service(principal, body, {});
      // 200 with the count; nothing else (no child payload, no candidates).
      return new Reply(result, 200);
    },
  });
}

export const POST = importRoute(defineRoute);
