// API-020 POST /api/auth/sign-in: credential sign-in for staff, officers and admins
// (FR-037, SCREEN-008). Public and same-origin; every failure is the generic E-002 and
// five failures a minute per network key give E-007 (src/server/auth/sign-in.ts).
// Success sets the 8-hour HttpOnly session cookie and returns the server-derived
// SessionView; role and verification are never taken from the request.
import { sessionViewSchema, type SessionView } from "@/contracts";
import { warmPasswordCheck } from "@/server/auth/password";
import { createSignIn } from "@/server/auth/sign-in";
import { defaultAuth, defaultAuthStore } from "@/server/auth/default";
import { defineRoute } from "../../_shared";

export const runtime = "nodejs"; // argon2 (native) and pg

let signIn: ReturnType<typeof createSignIn> | null = null;
// Build the dummy hash now, so the first unknown-user attempt costs one hash, not two.
void warmPasswordCheck();

export const POST = defineRoute({
  api: "API-020",
  response: sessionViewSchema,
  handler: async ({ req, cookies }): Promise<SessionView> => {
    signIn ??= createSignIn({ auth: defaultAuth(), store: defaultAuthStore() });
    return signIn(req, cookies);
  },
});
