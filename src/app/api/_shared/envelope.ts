// Bilingual error envelope responses (D2A §5.1–5.2, D2B §13). Built only from the
// contracts' `errorEnvelope`; E-022/E-024 are client-only and never sent.
import {
  CLIENT_ONLY_ERROR_IDS,
  ERROR_CATALOGUE,
  errorEnvelope,
  httpStatusFor,
  isUuid,
  type DraftFieldPath,
  type ErrorId,
  type ServerErrorId,
} from "@/contracts";

// Safe diagnostic tokens for logs; never sent to clients.
export const ERROR_REASONS = [
  "content_type", "too_large", "json", "utf8", "schema", "query_dup", "params", "multipart",
  "origin", "role", "authorize", "abort", "ratelimit", "resolver", "response", "audit",
] as const;
export type ErrorReason = (typeof ERROR_REASONS)[number];

export type ApiErrorParams = {
  seconds?: number; // E-007
  fields?: readonly DraftFieldPath[]; // E-001: contract draft paths only, never values
  caseId?: string; // E-004: the hidden case, for the access.denied audit FK (null when absent)
  reason?: ErrorReason;
};

// The message is the error ID only, so a thrown ApiError can never carry user data.
export class ApiError extends Error {
  readonly id: ServerErrorId;
  readonly seconds?: number;
  readonly fields?: readonly DraftFieldPath[];
  readonly caseId?: string;
  readonly reason?: ErrorReason;
  constructor(id: "E-007", params: { seconds: number; reason?: ErrorReason });
  constructor(id: "E-001", params?: { fields?: readonly DraftFieldPath[]; reason?: ErrorReason });
  constructor(id: "E-004", params?: { caseId?: string; reason?: ErrorReason });
  // Catch-all for error mappers; E-007 without valid seconds still becomes E-021.
  constructor(id: ServerErrorId, params?: ApiErrorParams);
  constructor(id: ServerErrorId, params: ApiErrorParams = {}) {
    super(id);
    this.name = "ApiError";
    this.id = id;
    this.seconds = params.seconds;
    if (id === "E-001" && params.fields?.length) this.fields = params.fields;
    if (id === "E-004" && isUuid(params.caseId)) this.caseId = params.caseId.toLowerCase();
    this.reason = params.reason;
  }
}

// Headers the route layer owns; a Reply cannot override them.
export const PROTECTED_HEADERS: ReadonlySet<string> = new Set([
  "content-type", "cache-control", "x-content-type-options", "x-request-id", "set-cookie", "retry-after",
]);

export function baseHeaders(requestId: string): Headers {
  return new Headers({
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "x-request-id": requestId,
  });
}

export function jsonResponse(requestId: string, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: baseHeaders(requestId) });
}

// Last resort when building an envelope itself fails: assembled from the catalogue
// without parsing, so it cannot throw.
const E021 = ERROR_CATALOGUE["E-021"];
const STATIC_E021_BODY = JSON.stringify({
  error: { id: "E-021", key: E021.key, message_bn: E021.bn, message_en: E021.en, retryable: E021.retryable },
});

export type ErrorResult = { response: Response; id: ServerErrorId; fallbackFrom?: ServerErrorId };

function isClientOnly(id: ErrorId): boolean {
  return (CLIENT_ONLY_ERROR_IDS as readonly ErrorId[]).includes(id);
}

function build(error: ApiError) {
  if (isClientOnly(error.id)) throw new Error("client-only error id");
  if (error.id === "E-007") return errorEnvelope("E-007", { seconds: error.seconds ?? 0 });
  if (error.id === "E-001") return errorEnvelope("E-001", error.fields ? { fields: error.fields } : {});
  return errorEnvelope(error.id);
}

// Falls back to E-021 for anything the catalogue cannot build safely (a client-only ID
// smuggled past the types, or E-007 without valid seconds) and reports the resolved ID.
export function errorResponse(requestId: string, error: ApiError, envelopeFor: typeof build = build): ErrorResult {
  try {
    const response = jsonResponse(requestId, httpStatusFor(error.id), envelopeFor(error));
    if (error.id === "E-007") response.headers.set("retry-after", String(error.seconds));
    return { response, id: error.id };
  } catch {
    let response: Response;
    try {
      response = jsonResponse(requestId, 500, envelopeFor(new ApiError("E-021")));
    } catch {
      response = new Response(STATIC_E021_BODY, { status: 500, headers: baseHeaders(requestId) });
    }
    return { response, id: "E-021", fallbackFrom: error.id };
  }
}
