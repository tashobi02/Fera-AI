// API-021 GET /api/admin/users: admin user listing for SCREEN-013 (TASK-032). See ../admin-routes.ts.
import { defineRoute } from "../../_shared";
import { usersRoute } from "../admin-routes";

export const runtime = "nodejs"; // pg

export const GET = usersRoute(defineRoute);
