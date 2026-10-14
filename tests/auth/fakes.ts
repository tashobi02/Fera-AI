// In-memory AuthStore and fixed keys for auth unit tests (synthetic accounts only).
import { randomUUID } from "node:crypto";
import { toDhakaIso, type UserRole } from "@/contracts";
import type { ParentSessionRow } from "@/contracts/server";
import { createAuth, type AuthKeys, type AuthStore, type AuthUserRow } from "@/server/auth";

export const KEYS: AuthKeys = { session: Buffer.alloc(32, 1), parent: Buffer.alloc(32, 2) };
export const DAY_MS = 86_400_000;

export class MemoryAuthStore implements AuthStore {
  readonly users = new Map<string, AuthUserRow & { username: string }>();
  readonly sessions = new Map<string, ParentSessionRow>();
  created = 0;
  reads = 0;

  constructor(private readonly now: () => number = Date.now) {}

  addUser(username: string, role: UserRole, passwordHash: string, opts: { verified?: boolean; isActive?: boolean } = {}): AuthUserRow {
    const row = {
      id: randomUUID(),
      username,
      role,
      verified: opts.verified ?? false,
      is_active: opts.isActive ?? true,
      display_name: `[MOCK] ${role} ${username.replace(/[0-9]/g, "")}`,
      password_hash: passwordHash,
    };
    this.users.set(row.id, row);
    return row;
  }

  addSession(opts: { expiresInMs?: number; revoked?: boolean } = {}): ParentSessionRow {
    const row = {
      id: randomUUID(),
      expires_at: toDhakaIso(this.now() + (opts.expiresInMs ?? 30 * DAY_MS)),
      revoked_at: opts.revoked ? toDhakaIso(this.now()) : null,
    };
    this.sessions.set(row.id, row);
    return row;
  }

  async userById(id: string) {
    this.reads++;
    return this.users.get(id) ?? null;
  }

  async userByUsername(username: string) {
    this.reads++;
    return [...this.users.values()].find((u) => u.username === username) ?? null;
  }

  async parentSession(id: string) {
    this.reads++;
    return this.sessions.get(id) ?? null;
  }

  async createParentSession() {
    this.created++;
    return this.addSession();
  }
}

export function fakeAuth(now: () => number = Date.now) {
  const store = new MemoryAuthStore(now);
  const auth = createAuth({ store, keys: () => KEYS, now });
  return { store, auth };
}

// "name=value" pairs from Set-Cookie lines, for the next request's Cookie header.
export function cookieHeaderFrom(res: Response): string {
  return res.headers
    .getSetCookie()
    .map((line) => line.split(";")[0])
    .join("; ");
}
