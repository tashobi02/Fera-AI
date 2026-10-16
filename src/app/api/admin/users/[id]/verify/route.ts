// API-017 POST /api/admin/users/:id/verify [MOCK]: seeded officer verification flag
// (TASK-032, SCREEN-013 ACT-028; BR-024). See ../../../admin-routes.ts.
import { defineRoute } from "../../../../_shared";
import { verifyRoute } from "../../../admin-routes";

export const runtime = "nodejs"; // pg

export const POST = verifyRoute(defineRoute);
