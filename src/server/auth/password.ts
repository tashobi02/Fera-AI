// Password hashing for staff/officer/admin accounts (D2B §10: argon2id). node:crypto
// gains argon2 only in Node 24.7, and package.json allows Node 22, so this uses
// @node-rs/argon2 (prebuilt N-API binary, on Next's server-external list).
//
// Parameters: argon2id, m = 19 MiB, t = 2, p = 1 (the OWASP minimum profile). Only a
// hash with exactly these parameters is accepted, so every verify costs the same.
// verifyPassword always runs one argon2 verification: for an unknown user, an unusable
// stored hash or a hash with other parameters it verifies against a dummy hash, so
// those paths cost the same as a wrong password. The comparison inside argon2 is
// constant-time. Hashing runs on the libuv thread pool, which bounds concurrent memory.
import { hash, verify } from "@node-rs/argon2";

export const ARGON2_PARAMS = { memoryCost: 19_456, timeCost: 2, parallelism: 1, outputLen: 32 } as const;
export const PASSWORD_MIN_CHARS = 10; // D2B §10.2 A07, for every create/reset path
export const PASSWORD_MAX_CHARS = 200; // signInRequestSchema

const PHC = /^\$argon2id\$v=19\$m=19456,t=2,p=1\$[A-Za-z0-9+/]{22}\$[A-Za-z0-9+/]{43}$/;

// Bangla input methods can produce the same visible text in different code-point
// orders, so passwords are NFC-normalised before hashing and before verifying.
const canonical = (password: string) => password.normalize("NFC");

export function isCurrentHash(stored: unknown): stored is string {
  return typeof stored === "string" && PHC.test(stored);
}

export function hashPassword(password: string): Promise<string> {
  const value = canonical(password);
  if (value.length < PASSWORD_MIN_CHARS || value.length > PASSWORD_MAX_CHARS) throw new Error("password length out of range");
  return hash(value, ARGON2_PARAMS);
}

let dummy: Promise<string> | null = null;
// A real hash of a random value with the same parameters, made once per process. A
// failed attempt is not cached, so the next call tries again.
function dummyHash(): Promise<string> {
  dummy ??= hash(crypto.randomUUID(), ARGON2_PARAMS).catch((err: unknown) => {
    dummy = null;
    throw err;
  });
  return dummy;
}

// Builds the dummy hash ahead of the first unknown-user request (sign-in route init), so
// that request does not pay for two hashes. Never throws.
export function warmPasswordCheck(): Promise<void> {
  return dummyHash().then(
    () => undefined,
    () => undefined,
  );
}

export async function verifyPassword(stored: string | null | undefined, password: string): Promise<boolean> {
  const usable = isCurrentHash(stored);
  let ok = false;
  try {
    ok = await verify(usable ? stored : await dummyHash(), canonical(password));
  } catch {
    ok = false;
  }
  return usable && ok;
}
