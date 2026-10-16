// API-006 POST /api/cases/:id/outputs (TASK-023, COMP-010/016): GD draft or poster text
// for the owning parent, or the 13219 summary (FR-010). Not-owned and absent are the same
// E-004. A blocked text is E-016.
import { z } from "zod";
import { outputRequestSchema, outputResponseSchema } from "@/contracts";
import { getOutput } from "@/server/outputs";
import { defineRoute } from "../../../_shared";

export const runtime = "nodejs";

export const POST = defineRoute({
  api: "API-006",
  params: z.object({ id: z.string() }), // a malformed ID is E-004 from readCase, like any hidden case
  body: outputRequestSchema,
  response: outputResponseSchema,
  handler: async ({ principal, params, body, requestId }) =>
    getOutput(principal, params.id, body.type, { requestId }),
});
