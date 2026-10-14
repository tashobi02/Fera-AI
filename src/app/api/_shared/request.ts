// Request ID, same-origin check, client address and Zod input helpers (D2A §5.1, §9.4,
// D2B §10.1). Every input failure is E-001 with at most the contracts' dotted draft
// field paths (D6 TC-030, CN-15): no Zod messages or input values are returned or logged.
import { randomUUID } from "node:crypto";
import { isIP } from "node:net";
import type { z } from "zod";
import { LIMITS, fieldsFromZodIssues, isUuid, type ServerErrorId } from "@/contracts";
import { ApiError, type ErrorReason } from "./envelope";

// The response and audit request ID is always generated here.
export function newRequestId(): string {
  return randomUUID();
}

// A client-supplied x-request-id is only logged, under its own key, and only when it is
// a UUID (so it can never carry a name or phone). It is never an audit request ID.
export function clientRequestId(req: Request): string | undefined {
  const incoming = req.headers.get("x-request-id");
  return incoming !== null && isUuid(incoming) ? incoming.toLowerCase() : undefined;
}

export const SAFE_METHODS: ReadonlySet<string> = new Set(["GET", "HEAD", "OPTIONS"]);

// Browsers always send Sec-Fetch-Site; older ones fall back to Origin vs the request's
// own scheme and Host. A request with neither is refused for state changes.
export function isSameOrigin(req: Request): boolean {
  const site = req.headers.get("sec-fetch-site");
  if (site !== null) return site === "same-origin";
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (origin === null || host === null || !URL.canParse(origin)) return false;
  const o = new URL(origin);
  return o.protocol === new URL(req.url).protocol && o.host === host.toLowerCase();
}

/* ---------- Client address (network rate-limit key) ---------- */

// x-forwarded-for is trusted only behind a proxy that overwrites it: on Vercel, or
// when TRUST_PROXY=1. Otherwise there is no address and every client shares one
// network bucket (the laptop finale without a proxy; open decision).
export function trustProxyFromEnv(env: Record<string, string | undefined> = process.env): boolean {
  return env.TRUST_PROXY === "1" || Boolean(env.VERCEL);
}

function ipv6Groups(ip: string): number[] | null {
  let s = ip;
  const v4 = /(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(s);
  if (v4) {
    if (isIP(v4[1]) !== 4) return null;
    const o = v4[1].split(".").map(Number);
    s = `${s.slice(0, -v4[1].length)}${((o[0] << 8) | o[1]).toString(16)}:${((o[2] << 8) | o[3]).toString(16)}`;
  }
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 ? (halves[1] ? halves[1].split(":") : []) : null;
  const groups = tail === null ? head : [...head, ...Array(8 - head.length - tail.length).fill("0"), ...tail];
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/i.test(g))) return null;
  return groups.map((g) => parseInt(g, 16));
}

// IPv4 as is; IPv4-mapped IPv6 as IPv4; other IPv6 grouped by /64 (one subscriber).
export function normaliseAddress(raw: string): string | null {
  const ip = raw.trim().replace(/%.*$/, "");
  const version = isIP(ip);
  if (version === 4) return ip;
  if (version !== 6) return null;
  const g = ipv6Groups(ip);
  if (!g) return null;
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) {
    return `${g[6] >> 8}.${g[6] & 255}.${g[7] >> 8}.${g[7] & 255}`;
  }
  return `${g.slice(0, 4).map((x) => x.toString(16)).join(":")}::/64`;
}

export function clientAddress(req: Request, trustProxy: boolean = trustProxyFromEnv()): string | null {
  if (!trustProxy) return null;
  const first = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const raw = first || req.headers.get("x-real-ip")?.trim();
  return raw ? normaliseAddress(raw) : null;
}

/* ---------- Zod input ---------- */

// Async so schemas with async refinements work too.
export async function parseWith<S extends z.ZodType>(schema: S, value: unknown, reason: ErrorReason = "schema"): Promise<z.output<S>> {
  const parsed = await schema.safeParseAsync(value);
  if (!parsed.success) {
    const fields = fieldsFromZodIssues(parsed.error.issues);
    throw new ApiError("E-001", fields ? { fields, reason } : { reason });
  }
  return parsed.data;
}

const JSON_CONTENT_TYPE = /^application\/json\s*(;\s*charset="?utf-8"?\s*)?$/i;
const MULTIPART_CONTENT_TYPE = /^multipart\/form-data\s*;\s*boundary=("?)[0-9A-Za-z'()+_,\-./:=?]{1,70}\1\s*$/i;

function checkDeclaredLength(req: Request, maxBytes: number, tooLarge: ServerErrorId): void {
  const declared = req.headers.get("content-length");
  if (declared === null) return;
  if (!/^\d{1,12}$/.test(declared)) throw new ApiError("E-001", { reason: "too_large" });
  if (Number(declared) > maxBytes) throw new ApiError(tooLarge, { reason: "too_large" });
}

// Reads at most maxBytes; a client abort or stream error is E-001, not E-021.
export async function readCapped(req: Request, maxBytes: number, tooLarge: ServerErrorId = "E-001"): Promise<Uint8Array<ArrayBuffer>> {
  if (req.body === null) return new Uint8Array(0);
  const chunks: Uint8Array[] = [];
  let total = 0;
  let reader: ReadableStreamDefaultReader<Uint8Array>;
  try {
    reader = req.body.getReader();
  } catch {
    throw new ApiError("E-001", { reason: "abort" });
  }
  for (;;) {
    let step: ReadableStreamReadResult<Uint8Array>;
    try {
      step = await reader.read();
    } catch {
      throw new ApiError("E-001", { reason: "abort" });
    }
    if (step.done) break;
    total += step.value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new ApiError(tooLarge, { reason: "too_large" });
    }
    chunks.push(step.value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

// JSON body: content type and size are checked before any parsing.
export async function readJsonBody<S extends z.ZodType>(
  req: Request,
  schema: S,
  maxBytes: number = LIMITS.jsonBodyBytes,
): Promise<z.output<S>> {
  if (!JSON_CONTENT_TYPE.test(req.headers.get("content-type") ?? "")) throw new ApiError("E-001", { reason: "content_type" });
  checkDeclaredLength(req, maxBytes, "E-001");
  const bytes = await readCapped(req, maxBytes);
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new ApiError("E-001", { reason: "utf8" });
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new ApiError("E-001", { reason: "json" });
  }
  return parseWith(schema, value);
}

// Multipart for API-001 (D2A §9.4). The whole body is capped at the audio limit plus
// room for boundaries and text fields; the route still checks the audio part itself
// against LIMITS.audioMaxBytes and its duration (BR-023). Oversize is E-008 by default.
export const MULTIPART_OVERHEAD_BYTES = 16 * 1024;

export async function readMultipart(
  req: Request,
  opts: { maxBytes?: number; tooLarge?: "E-001" | "E-008" } = {},
): Promise<FormData> {
  const contentType = req.headers.get("content-type") ?? "";
  if (!MULTIPART_CONTENT_TYPE.test(contentType)) throw new ApiError("E-001", { reason: "content_type" });
  const maxBytes = opts.maxBytes ?? LIMITS.audioMaxBytes + MULTIPART_OVERHEAD_BYTES;
  const tooLarge = opts.tooLarge ?? "E-008";
  checkDeclaredLength(req, maxBytes, tooLarge);
  const bytes = await readCapped(req, maxBytes, tooLarge);
  try {
    return await new Response(bytes, { headers: { "content-type": contentType } }).formData();
  } catch {
    throw new ApiError("E-001", { reason: "multipart" });
  }
}

// Query strings: collected in a Map so `__proto__` is an ordinary key, and a repeated
// key is ambiguous and rejected.
export async function parseQuery<S extends z.ZodType>(req: Request, schema: S): Promise<z.output<S>> {
  const seen = new Map<string, string>();
  for (const [key, value] of new URL(req.url).searchParams) {
    if (seen.has(key)) throw new ApiError("E-001", { reason: "query_dup" });
    seen.set(key, value);
  }
  return parseWith(schema, Object.fromEntries(seen));
}

export async function parseParams<S extends z.ZodType>(
  params: Promise<Record<string, string | string[] | undefined>> | undefined,
  schema: S,
): Promise<z.output<S>> {
  return parseWith(schema, (await params) ?? {}, "params");
}
