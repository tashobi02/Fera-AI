// Per-request Set-Cookie collector. The principal resolver (TASK-006) uses it to mint
// the parent `fera_ps` session on the first intake call (D2A §9.1); the route layer
// applies it to whatever response is sent, success or error. Defaults follow D2A §9.4:
// HttpOnly, SameSite=Lax, Path=/, no Domain, Secure in production (not under DEMO_MODE=1).
const NAME = /^(__Host-)?[A-Za-z0-9_-]{1,64}$/;
const VALUE = /^[A-Za-z0-9._~-]{0,4096}$/;

export type CookieOptions = {
  maxAgeSeconds?: number;
  httpOnly?: boolean;
  sameSite?: "Lax" | "Strict";
  secure?: boolean;
};

// Production is Vercel or NODE_ENV=production. DEMO_MODE=1 is the offline finale laptop
// over plain HTTP, where Secure cookies would be dropped, so it turns Secure off.
export function isProductionEnv(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.VERCEL) || env.NODE_ENV === "production";
}

export function secureCookiesFor(production: boolean, env: Record<string, string | undefined> = process.env): boolean {
  return production && env.DEMO_MODE !== "1";
}

export class CookieJar {
  private readonly lines: string[] = [];

  constructor(private readonly secureDefault: boolean) {}

  // Whether cookies default to Secure; auth uses it to pick `__Host-` names.
  get secure(): boolean {
    return this.secureDefault;
  }

  set(name: string, value: string, opts: CookieOptions = {}): void {
    if (!NAME.test(name) || !VALUE.test(value)) throw new Error("invalid cookie name or value");
    const secure = opts.secure ?? this.secureDefault;
    if (name.startsWith("__Host-") && !secure) throw new Error("__Host- cookies must be Secure");
    const parts = [`${name}=${value}`, "Path=/", `SameSite=${opts.sameSite ?? "Lax"}`];
    if (opts.maxAgeSeconds !== undefined) {
      if (!Number.isInteger(opts.maxAgeSeconds) || opts.maxAgeSeconds < 0) throw new Error("invalid cookie max-age");
      parts.push(`Max-Age=${opts.maxAgeSeconds}`);
    }
    if (opts.httpOnly ?? true) parts.push("HttpOnly");
    if (secure) parts.push("Secure");
    this.lines.push(parts.join("; "));
  }

  clear(name: string, opts: Omit<CookieOptions, "maxAgeSeconds"> = {}): void {
    this.set(name, "", { ...opts, maxAgeSeconds: 0 });
  }

  get size(): number {
    return this.lines.length;
  }

  applyTo(headers: Headers): void {
    for (const line of this.lines) headers.append("set-cookie", line);
  }
}
