// Default auth wiring (TASK-006): the fera_app pool and keys read from the environment
// at call time. Kept free of the argon2 module so routes that only resolve a principal
// do not load it; the sign-in route builds its own createSignIn on top of this.
import { getPool } from "@/server/db/pool";
import { loadSecret, subkey } from "./secrets";
import { createAuth, type Auth } from "./session";
import { pgAuthStore, type AuthStore } from "./store";

let store: AuthStore | null = null;
let auth: Auth | null = null;

export function defaultAuthStore(): AuthStore {
  store ??= pgAuthStore(() => getPool());
  return store;
}

export function defaultAuth(): Auth {
  auth ??= createAuth({
    store: defaultAuthStore(),
    keys: {
      session: () => subkey(loadSecret("AUTH_SECRET"), "user-session.v1"),
      parent: () => subkey(loadSecret("PARENT_COOKIE_KEY"), "parent-session.v1"),
    },
  });
  return auth;
}
