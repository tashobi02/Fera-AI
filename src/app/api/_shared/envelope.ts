// Bilingual error envelope responses (D2A §5.1–5.2, D2B §13). Built only from the
// contracts' `errorEnvelope`; E-022/E-024 are client-only and never sent.
import { CLIENT_ONLY_ERROR_IDS, errorEnvelope, httpStatusFor, type ErrorId, type ServerErrorId } from "@/contracts";

// The message is the error ID only, so a thrown ApiError can never carry user data.
export class ApiError extends Error {
  readonly id: ServerErrorId;
  readonly seconds?: number;
  constructor(id: "E-007", params: { seconds: number });
  constructor(id: Exclude<ServerErrorId, "E-007">);
  constructor(id: ServerErrorId, params?: { seconds: number }) {
    super(id);
    this.name = "ApiError";
    this.id = id;
    this.seconds = params?.seconds;
  }
}

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

function isClientOnly(id: ErrorId): boolean {
  return (CLIENT_ONLY_ERROR_IDS as readonly ErrorId[]).includes(id);
}

// Falls back to E-021 for anything the catalogue cannot build safely (a client-only ID
// smuggled past the types, or E-007 without valid seconds).
export function errorResponse(requestId: string, error: ApiError): Response {
  let id: ServerErrorId = error.id;
  let envelope;
  try {
    if (isClientOnly(id)) throw new Error("client-only error id");
    envelope = id === "E-007" ? errorEnvelope("E-007", { seconds: error.seconds ?? 0 }) : errorEnvelope(id);
  } catch {
    id = "E-021";
    envelope = errorEnvelope("E-021");
  }
  const res = jsonResponse(requestId, httpStatusFor(id), envelope);
  if (id === "E-007") res.headers.set("retry-after", String(error.seconds));
  return res;
}
