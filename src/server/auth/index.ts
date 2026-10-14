// Server auth (TASK-006). Route handlers resolve principals through the API layer's
// default resolver; server components use require-role.ts.
export { defaultAuth, defaultAuthStore } from "./default";
export { createAuth, MINTING_APIS } from "./session";
export type { Auth, AuthDeps, AuthKeys } from "./session";
export { createSignIn } from "./sign-in";
export type { SignInDeps } from "./sign-in";
export { pgAuthStore } from "./store";
export type { AuthStore, AuthUserRow } from "./store";
export { hashPassword, verifyPassword, isCurrentHash, warmPasswordCheck, ARGON2_PARAMS, PASSWORD_MIN_CHARS } from "./password";
export { cookieNames, cookieSourceFromHeader, SESSION_TTL_SECONDS, PARENT_COOKIE_MAX_AGE_SECONDS } from "./tokens";
export type { CookieSource } from "./tokens";
export { loadSecret, subkey, decodeSecret, SecretConfigError } from "./secrets";
