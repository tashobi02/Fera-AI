// Account and parent-session reads for auth (fera_app grants: users SELECT,
// parent_sessions SELECT/INSERT). Hand-written, parameterised SQL; no other columns.
import type { Pool } from "pg";
import { isUuid, toDhakaIso, type UserRole } from "@/contracts";
import type { ParentSessionRow, UserRow } from "@/contracts/server";

// Server-only: password_hash never leaves src/server/auth.
export type AuthUserRow = UserRow & { display_name: string; password_hash: string };

export interface AuthStore {
  userById(id: string): Promise<AuthUserRow | null>;
  userByUsername(username: string): Promise<AuthUserRow | null>;
  parentSession(id: string): Promise<ParentSessionRow | null>;
  createParentSession(): Promise<ParentSessionRow>;
}

const USER_COLUMNS = "id, role, verified, is_active, display_name, password_hash";

type UserRecord = { id: string; role: UserRole; verified: boolean; is_active: boolean; display_name: string; password_hash: string };
type SessionRecord = { id: string; expires_at: Date; revoked_at: Date | null };

const toUser = (r: UserRecord | undefined): AuthUserRow | null =>
  r ? { id: r.id, role: r.role, verified: r.verified, is_active: r.is_active, display_name: r.display_name, password_hash: r.password_hash } : null;

const toSession = (r: SessionRecord): ParentSessionRow => ({
  id: r.id,
  expires_at: toDhakaIso(r.expires_at.getTime()),
  revoked_at: r.revoked_at ? toDhakaIso(r.revoked_at.getTime()) : null,
});

// `pool` is a getter so the pool is created on first query, not at import.
export function pgAuthStore(pool: () => Pool): AuthStore {
  return {
    async userById(id) {
      if (!isUuid(id)) return null;
      const { rows } = await pool().query<UserRecord>(`SELECT ${USER_COLUMNS} FROM users WHERE id = $1`, [id]);
      return toUser(rows[0]);
    },
    async userByUsername(username) {
      const { rows } = await pool().query<UserRecord>(`SELECT ${USER_COLUMNS} FROM users WHERE username = $1`, [username]);
      return toUser(rows[0]);
    },
    async parentSession(id) {
      if (!isUuid(id)) return null;
      const { rows } = await pool().query<SessionRecord>("SELECT id, expires_at, revoked_at FROM parent_sessions WHERE id = $1", [id]);
      return rows[0] ? toSession(rows[0]) : null;
    },
    async createParentSession() {
      const { rows } = await pool().query<SessionRecord>("INSERT INTO parent_sessions DEFAULT VALUES RETURNING id, expires_at, revoked_at");
      if (!rows[0]) throw new Error("parent session insert returned no row");
      return toSession(rows[0]);
    },
  };
}
