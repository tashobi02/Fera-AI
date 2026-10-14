// Server-derived principals and the D2A §9.2 permission matrix (BR-007/024).
//
// A Principal is built per request from database rows, never from client input or
// JWT claims alone: `verified` and `isActive` are read from `users` on every request,
// and a parent session must exist, be unexpired and unrevoked. IDs are validated as
// UUIDs so a missing ID can never compare equal to another missing ID.
import { isUuid } from "../primitives";
import type { CaseKind, UserRole } from "../states";
import type { ParentSessionRow, UserRow } from "./rows";

export type Principal =
  | { kind: "parent"; sessionId: string }
  | { kind: "user"; userId: string; role: UserRole; verified: boolean; isActive: boolean };

export function parentPrincipal(session: ParentSessionRow | null, nowMs: number = Date.now()): Principal | null {
  if (!session || !isUuid(session.id) || session.revoked_at !== null) return null;
  const expires = Date.parse(session.expires_at);
  if (!Number.isFinite(expires) || expires <= nowMs) return null;
  return { kind: "parent", sessionId: session.id.toLowerCase() };
}

export function userPrincipal(user: UserRow | null): Principal | null {
  if (!user || !isUuid(user.id)) return null;
  return {
    kind: "user",
    userId: user.id.toLowerCase(),
    role: user.role,
    verified: user.role === "officer" && user.verified,
    isActive: user.is_active,
  };
}

export type EffectiveRole = "parent" | "staff" | "officer" | "admin";

// Unverified officers have staff permissions; inactive or malformed principals have none (§5.3, BR-024).
export function effectiveRole(p: Principal | null): EffectiveRole | null {
  if (!p) return null;
  if (p.kind === "parent") return isUuid(p.sessionId) ? "parent" : null;
  if (!isUuid(p.userId) || !p.isActive) return null;
  if (p.role === "officer") return p.verified ? "officer" : "staff";
  return p.role;
}

export const API_IDS = [
  "API-001", "API-002", "API-003", "API-004", "API-005", "API-006", "API-007", "API-008",
  "API-009", "API-010", "API-011", "API-012", "API-013", "API-014", "API-015", "API-016",
  "API-017", "API-018", "API-019", "API-020", "API-021", "API-022", "API-023",
] as const;
export type ApiId = (typeof API_IDS)[number];

// D2A §9.2. "public" routes need no session. Ownership is checked separately.
export const API_ACCESS: Record<ApiId, readonly (EffectiveRole | "public")[]> = {
  "API-001": ["parent", "staff", "officer"],
  "API-002": ["parent", "staff", "officer"],
  "API-003": ["parent"],
  "API-004": ["parent", "staff", "officer", "admin"],
  "API-005": ["parent"],
  "API-006": ["parent"],
  "API-007": ["staff", "officer"],
  "API-008": ["officer"],
  "API-009": ["officer"],
  "API-010": ["officer"],
  "API-011": ["officer"],
  "API-012": ["officer", "admin"],
  "API-013": ["officer", "admin"],
  "API-014": ["officer", "admin"],
  "API-015": ["admin"],
  "API-016": ["admin"],
  "API-017": ["admin"],
  "API-018": ["parent"],
  "API-019": ["public"],
  "API-020": ["public"],
  "API-021": ["admin"],
  "API-022": ["officer"],
  "API-023": ["officer"],
};

export function canCall(api: ApiId, p: Principal | null): boolean {
  const allowed = API_ACCESS[api];
  if (allowed.includes("public")) return true;
  const role = effectiveRole(p);
  return role !== null && allowed.includes(role);
}

// API-001/002 intake kind (D2A §9.2): parents report missing children only;
// staff and officers (verified or not) log found children only.
export function canIntake(p: Principal | null, kind: CaseKind): boolean {
  const role = effectiveRole(p);
  if (role === "parent") return kind === "missing";
  if (role === "staff" || role === "officer") return kind === "found";
  return false;
}
