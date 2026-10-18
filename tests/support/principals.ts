// Test-only principal helpers. They go through the real constructors, so tests can
// never hold a principal that production code could not have minted.
import { parentPrincipal, userPrincipal, type Principal } from "@/contracts/server";
import type { UserRole } from "@/contracts";

const FAR_FUTURE = "2099-01-01T00:00:00+06:00";

export function testParent(sessionId: string): Principal {
  const p = parentPrincipal({ id: sessionId, expires_at: FAR_FUTURE, revoked_at: null });
  if (!p) throw new Error("invalid test session id");
  return p;
}

export function testUser(userId: string, role: UserRole, opts: { verified?: boolean; isActive?: boolean } = {}): Principal {
  const p = userPrincipal({ id: userId, role, verified: opts.verified ?? false, is_active: opts.isActive ?? true });
  if (!p) throw new Error("invalid test user id");
  return p;
}
