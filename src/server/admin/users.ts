// API-021 admin user listing (TASK-032; D2A API-021, FR-035, SCREEN-013). Owner: Mahim.
//
// - Admin only (an active admin principal, re-read from users on every request).
// - Reads exactly the AdminUserView columns: id, username, display_name, role, verified,
//   is_active. Never password_hash, sessions or any case data. The rows are parsed with
//   the contract's strict adminUsersResponseSchema, so an extra key or a bad value fails
//   closed (E-021) instead of being sent.
// - Keyset pagination by username (unique). The cursor is opaque and HMAC-signed with a
//   purpose subkey of AUTH_SECRET (OD-032-3): `base64url(json) "." base64url(mac)`. A
//   cursor that fails the signature or shape check is E-001.
import { createHmac, timingSafeEqual } from "node:crypto";
import { ApiError } from "@/app/api/_shared/envelope";
import { LIMITS, USER_ROLES, adminUsersResponseSchema, type AdminUsersResponse, type PageQuery } from "@/contracts";
import { effectiveRole, type Principal } from "@/contracts/server";
import { loadSecret, subkey } from "@/server/auth/secrets";
import { asRow, col } from "@/server/db/decode";
import type { Queryable } from "@/server/db/queryable";
import { getPool } from "@/server/db/pool";

export type AdminReadContext = { pool?: Queryable; key?: Buffer };

const cursorKey = (ctx: AdminReadContext) => ctx.key ?? subkey(loadSecret("AUTH_SECRET"), "cursor.admin_users");
const mac = (key: Buffer, payload: string) => createHmac("sha256", key).update(payload).digest("base64url");

export function encodeUsersCursor(after: string, key: Buffer): string {
  const payload = Buffer.from(JSON.stringify({ v: 1, after }), "utf8").toString("base64url");
  return `${payload}.${mac(key, payload)}`;
}

// Returns the username to continue after, or null when the cursor is not ours.
export function decodeUsersCursor(cursor: string, key: Buffer): string | null {
  const [payload, sig, extra] = cursor.split(".");
  if (!payload || !sig || extra !== undefined) return null;
  const want = Buffer.from(mac(key, payload));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const value: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (typeof value !== "object" || value === null) return null;
    const { v, after } = value as { v?: unknown; after?: unknown };
    return v === 1 && typeof after === "string" && after.length > 0 && after.length <= 64 ? after : null;
  } catch {
    return null;
  }
}

export async function listAdminUsers(principal: Principal, query: PageQuery = {}, ctx: AdminReadContext = {}): Promise<AdminUsersResponse> {
  if (principal.kind !== "user" || effectiveRole(principal) !== "admin") throw new ApiError("E-003", { reason: "authorize" });
  const limit = query.limit ?? LIMITS.pageSize.max;
  const key = query.cursor !== undefined ? cursorKey(ctx) : null;
  const after = query.cursor !== undefined && key ? decodeUsersCursor(query.cursor, key) : null;
  if (query.cursor !== undefined && after === null) throw new ApiError("E-001", { reason: "schema" });

  const db = ctx.pool ?? getPool();
  const { rows } = await db.query(
    `SELECT id, username, display_name, role::text AS role, verified, is_active FROM users
     WHERE ($1::text IS NULL OR username > $1) ORDER BY username LIMIT $2`,
    [after, limit + 1],
  );
  const page = rows.slice(0, limit).map((raw) => {
    const r = asRow("users", raw);
    return {
      id: col.uuid("users", r, "id"),
      username: col.text("users", r, "username"),
      display_name: col.text("users", r, "display_name"),
      role: col.oneOf("users", r, "role", USER_ROLES),
      verified: col.bool("users", r, "verified"),
      is_active: col.bool("users", r, "is_active"),
    };
  });
  const last = page.at(-1);
  const next = rows.length > limit && last ? encodeUsersCursor(last.username, key ?? cursorKey(ctx)) : null;
  return adminUsersResponseSchema.parse({ users: page, next_cursor: next });
}
