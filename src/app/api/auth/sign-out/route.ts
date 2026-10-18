// API-020 POST /api/auth/sign-out (ACT-029): clears the credential session cookie.
// Public and same-origin, so a cross-site page cannot sign a user out. The session is a
// signed stateless token: clearing the cookie ends it on this browser; deactivating the
// account or resetting its password ends it everywhere (the user row is re-read on
// every request). The parent cookie is left alone.
import { z } from "zod";
import { defaultAuth } from "@/server/auth/default";
import { defineRoute } from "../../_shared";

export const runtime = "nodejs";

// Not in src/contracts yet (contract change requested): `{ signed_out: true }`.
const signOutResponseSchema = z.strictObject({ signed_out: z.literal(true) });

export const POST = defineRoute({
  api: "API-020",
  response: signOutResponseSchema,
  handler: async ({ cookies }) => {
    defaultAuth().endSession(cookies);
    return { signed_out: true as const };
  },
});
