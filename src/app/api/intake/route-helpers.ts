// API-001 / API-002 route factory (TASK-014/020, FR-002/003/004/005, TC-002/003/043/060/061).
//
// Builds the transcribe and extract handlers as a single factory so the same
// implementation runs in production (real auth, real registry, real provider
// dispatch) and in tests (fake resolvers, fake registry, fake adapters). The
// factory closes over the orchestrator dependencies and returns the route
// Handler functions Next expects. The factory never imports from the spend / db
// layer directly; everything passes through the orchestrator.
import { ApiError, defineRoute, RATE_LIMITS, readMultipart, Reply } from "@/app/api/_shared";
import {
  transcribeResponseSchema,
  extractRequestSchema,
  extractResponseSchema,
  LIMITS,
  type ExtractResponse,
  type ErrorEnvelope,
  type TranscribeFields,
  type TranscribeResponse,
} from "@/contracts";
import {
  type OrchestratorDeps,
  orchestrateTranscribe,
  orchestrateExtract,
} from "@/server/intake";

const MULTIPART_MAX = LIMITS.audioMaxBytes + 16 * 1024;

function throwIntakeError(error: ErrorEnvelope): never {
  const { id } = error.error;
  if (id === "E-022" || id === "E-024") {
    throw new ApiError("E-021");
  }
  throw new ApiError(id);
}

export type IntakeRouteDeps = OrchestratorDeps;

function parseDuration(value: string): number {
  if (!/^[0-9]{1,3}(\.[0-9]{1,3})?$/.test(value)) throw new ApiError("E-001", { reason: "schema" });
  const n = Number(value);
  if (!Number.isFinite(n)) throw new ApiError("E-001", { reason: "schema" });
  return n;
}

function parseAudioCt(mime: string): string {
  if (!/^audio\//.test(mime)) throw new ApiError("E-001", { reason: "schema" });
  if (!/codecs=opus|webm|wav|mp4|ogg|amr|aac/.test(mime)) throw new ApiError("E-001", { reason: "schema" });
  return mime;
}

export function makeTranscribeHandler(getDeps: () => IntakeRouteDeps) {
  return defineRoute({
    api: "API-001",
    response: transcribeResponseSchema,
    rateLimit: [RATE_LIMITS.aiPrincipal, RATE_LIMITS.aiNetwork],
    paid: true,
    handler: async ({ req, principal, requestId }): Promise<Reply<TranscribeResponse>> => {
      if (!principal) throw new ApiError("E-002");
      const form = await readMultipart(req, { maxBytes: MULTIPART_MAX, tooLarge: "E-008" });
      const kind = form.get("kind");
      const durationRaw = form.get("duration_s");
      const draftTokenRaw = form.get("draft_token");
      const fixtureRaw = form.get("fixture_id");
      const audioPart = form.get("audio");
      if (typeof kind !== "string" || (kind !== "missing" && kind !== "found")) {
        throw new ApiError("E-001", { reason: "schema" });
      }
      if (typeof durationRaw !== "string") throw new ApiError("E-001", { reason: "schema" });
      const duration_s = parseDuration(durationRaw);
      if (!(audioPart instanceof File)) throw new ApiError("E-001", { reason: "schema" });
      const audioBytes = new Uint8Array(await audioPart.arrayBuffer());
      if (audioBytes.byteLength === 0) throw new ApiError("E-008");
      if (audioBytes.byteLength > LIMITS.audioMaxBytes) throw new ApiError("E-008");
      const ct = parseAudioCt((audioPart.type || "audio/webm;codecs=opus").toLowerCase());
      const fields: TranscribeFields = {
        kind: kind as "missing" | "found",
        duration_s,
        ...(typeof draftTokenRaw === "string" ? { draft_token: draftTokenRaw } : {}),
        ...(typeof fixtureRaw === "string" ? { fixture_id: fixtureRaw } : {}),
      };
      const out = await orchestrateTranscribe(getDeps(), {
        fields,
        audio: { bytes: audioBytes, mime: ct },
        fixtureId: typeof fixtureRaw === "string" ? fixtureRaw : null,
        headers: req.headers,
        principal,
        requestId,
      });
      if (!out.ok) throwIntakeError(out.error);
      return new Reply(out.response);
    },
  });
}

export function makeExtractHandler(getDeps: () => IntakeRouteDeps) {
  return defineRoute({
    api: "API-002",
    body: extractRequestSchema,
    response: extractResponseSchema,
    rateLimit: [RATE_LIMITS.aiPrincipal, RATE_LIMITS.aiNetwork],
    paid: true,
    handler: async ({ req, principal, body, requestId }): Promise<Reply<ExtractResponse>> => {
      if (!principal) throw new ApiError("E-002");
      const out = await orchestrateExtract(getDeps(), {
        body,
        headers: req.headers,
        principal,
        requestId,
      });
      if (!out.ok) throwIntakeError(out.error);
      return new Reply(out.response);
    },
  });
}

export function buildIntakeRoutes(getDeps: () => IntakeRouteDeps) {
  return {
    transcribe: makeTranscribeHandler(getDeps),
    extract: makeExtractHandler(getDeps),
  };
}
