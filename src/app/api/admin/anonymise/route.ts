// API-016 POST /api/admin/anonymise (legacy route name): redact identifying payloads from
// eligible terminal reports (TASK-032, SCREEN-013 ACT-027). See ../admin-routes.ts.
import { defineRoute } from "../../_shared";
import { anonymiseRoute } from "../admin-routes";

export const runtime = "nodejs"; // pg

export const POST = anonymiseRoute(defineRoute);
