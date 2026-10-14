// Request ID, same-origin check and Zod input helpers (D2A §5.1, §9.4, D2B §10.1).
// Every input failure is a bare E-001: no Zod messages, field paths or input values
// are returned or logged (OD-1 in specs/001-platform-foundation/contract-notes.md).
import { randomUUID } from "node:crypto";
import type { z } from "zod";
import { LIMITS, isUuid } from "@/contracts";
import { ApiError } from "./envelope";

// Only a UUID is accepted from the client, so a request ID can never carry a name or phone.
export function requestIdFrom(req: Request): string {
  const incoming = req.headers.get("x-request-id");
  return incoming !== null && isUuid(incoming) ? incoming.toLowerCase() : randomUUID();
}

export const SAFE_METHODS: ReadonlySet<string> = new Set(["GET", "HEAD", "OPTIONS"]);

// Browsers always send Sec-Fetch-Site; older ones fall back to Origin vs Host. A
// request with neither is refused for state changes.
export function isSameOrigin(req: Request): boolean {
  const site = req.headers.get("sec-fetch-site");
  if (site !== null) return site === "same-origin";
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (origin === null || host === null || !URL.canParse(origin)) return false;
  return new URL(origin).host === host.toLowerCase();
}

// Trusts the platform proxy's x-forwarded-for (Vercel overwrites it). A direct
// `next start` deploy lets clients set it: open decision for the laptop stack.
export function clientAddress(req: Request): string | null {
  const first = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = first || req.headers.get("x-real-ip")?.trim();
  return ip && /^[0-9A-Fa-f:.]{2,45}$/.test(ip) ? ip : null;
}

export function parseWith<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new ApiError("E-001");
  return parsed.data;
}

const JSON_CONTENT_TYPE = /^application\/json\s*(;\s*charset="?utf-8"?\s*)?$/i;

async function readCapped(req: Request, maxBytes: number): Promise<Uint8Array> {
  if (req.body === null) return new Uint8Array(0);
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new ApiError("E-001");
    }
    chunks.push(value);
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
  if (!JSON_CONTENT_TYPE.test(req.headers.get("content-type") ?? "")) throw new ApiError("E-001");
  const declared = req.headers.get("content-length");
  if (declared !== null && !(/^\d{1,12}$/.test(declared) && Number(declared) <= maxBytes)) {
    throw new ApiError("E-001");
  }
  const bytes = await readCapped(req, maxBytes);
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new ApiError("E-001");
  }
  return parseWith(schema, value);
}

// Query strings: a repeated key is ambiguous and rejected.
export function parseQuery<S extends z.ZodType>(req: Request, schema: S): z.output<S> {
  const params = new URL(req.url).searchParams;
  const record: Record<string, string> = {};
  for (const [key, value] of params) {
    if (Object.hasOwn(record, key)) throw new ApiError("E-001");
    record[key] = value;
  }
  return parseWith(schema, record);
}

export async function parseParams<S extends z.ZodType>(
  params: Promise<Record<string, string | string[] | undefined>> | undefined,
  schema: S,
): Promise<z.output<S>> {
  return parseWith(schema, (await params) ?? {});
}
