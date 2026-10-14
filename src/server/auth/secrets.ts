// Signing keys for the credential session (AUTH_SECRET) and the parent cookie
// (PARENT_COOKIE_KEY), D2B §15.1: "32+ random bytes, base64". Read at call time, never
// logged. In production (Vercel or NODE_ENV=production, which includes the DEMO_MODE=1
// laptop) a missing or short key is an error. In development and tests a missing key
// becomes a random per-process key with one warning, so sessions end on restart.
import { createHmac, randomBytes } from "node:crypto";
import { isProductionEnv } from "@/app/api/_shared/cookies";
import { createLogger } from "@/app/api/_shared/log";

export type SecretName = "AUTH_SECRET" | "PARENT_COOKIE_KEY";
export type Env = Record<string, string | undefined>;

const MIN_BYTES = 32;
const BASE64 = /^[A-Za-z0-9+/_-]+={0,2}$/;

export class SecretConfigError extends Error {
  constructor(name: SecretName) {
    super(`${name} must be set to at least ${MIN_BYTES} random bytes, base64-encoded`);
    this.name = "SecretConfigError";
  }
}

const devKeys: Map<SecretName, Buffer> = ((globalThis as { __feraDevKeys?: Map<SecretName, Buffer> }).__feraDevKeys ??= new Map());
const logger = createLogger();

export function decodeSecret(raw: string | undefined): Buffer | null {
  if (!raw || !BASE64.test(raw)) return null;
  const bytes = Buffer.from(raw, raw.includes("-") || raw.includes("_") ? "base64url" : "base64");
  return bytes.length >= MIN_BYTES ? bytes : null;
}

export function loadSecret(name: SecretName, env: Env = process.env): Buffer {
  const raw = env[name];
  const decoded = decodeSecret(raw);
  if (decoded) return decoded;
  if (raw || isProductionEnv(env)) throw new SecretConfigError(name);
  let key = devKeys.get(name);
  if (!key) {
    key = randomBytes(MIN_BYTES);
    devKeys.set(name, key);
    logger.warn({ event: "auth.dev_secret" });
  }
  return key;
}

// One subkey per purpose, so a token for one use can never verify as another.
export function subkey(secret: Buffer, purpose: string): Buffer {
  return createHmac("sha256", secret).update(`fera.${purpose}`).digest();
}
