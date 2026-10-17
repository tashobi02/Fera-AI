// Shared route dependencies for /api/intake/**. The transcribe and extract
// routes import the buildIntakeRoutes factory and bind the same getDeps()
// closure, so they share the metadata-only registry, the same draft signer
// and the same provider stubs. Tests use the same factory with their own
// getDeps() so the production code never sees paid provider calls.
//
// The default price sheet is UNKNOWN, so these scripted adapters cannot be
// reached by an ordinary cache miss. DEMO_MODE=1 enables only API-002's exact
// source-text fixture; API-001 has no transcript fixture until matching audio
// bytes are checked in.
import { brandSttDispatch, type RawSttDispatch, type SttProvider, type SttDispatch } from "@/server/speech/types";
import { brandProviderDispatch, type LLMProvider, type ProviderDispatch, type RawDispatch } from "@/server/ai";
import { UNKNOWN_PRICE_SHEET, type PriceSheet } from "@/server/spend";
import { createDraftSigner, createDraftRegistry, verifyDraftToken, type DraftRegistry } from "@/server/intake";
import { verifyAudioMetadata } from "@/server/intake/audio-metadata";
import { loadSecret } from "@/server/auth/secrets";
import { buildIntakeRoutes } from "./route-helpers";

// Synthetic scripted STT provider used in the default route factory. Returns
// a single deterministic Bangla transcript so the route handler stays
// present but is never reached while the default price sheet is UNKNOWN.
const scriptedStt: SttProvider = {
  name: "[MOCK] intake.default",
  async transcribe() {
    return { text: "[MOCK] আমার ছেলে রাফি, বয়স ১৩" };
  },
};

const scriptedLlm: LLMProvider = {
  name: "[MOCK] intake.default",
  async extract() {
    return { ok: true, draft: undefined };
  },
};

const speechDispatch: RawSttDispatch = (provider, audio, options) => provider.transcribe(audio, options);
const llmDispatch: RawDispatch = (provider, request, options) => provider.extract(request, options);

let cached: { transcribe: ReturnType<typeof buildIntakeRoutes>["transcribe"]; extract: ReturnType<typeof buildIntakeRoutes>["extract"] } | null = null;

export function getIntakeRouteDeps() {
  return getDeps();
}

function getDeps() {
  if (cached) return cached;
  // Draft tokens fail closed if the server key is missing or malformed.
  const draftSecret = loadSecret("DRAFT_SIGNING_KEY");
  const signer = createDraftSigner(draftSecret);
  const registry: DraftRegistry = createDraftRegistry({
    signer,
    verify: (token, kind, principal) => verifyDraftToken(draftSecret, token, kind, principal),
  });
  const priceSheet: PriceSheet = UNKNOWN_PRICE_SHEET;
  const speechDeps = {
    primary: scriptedStt,
    fallback: scriptedStt,
    dispatch: brandSttDispatch(speechDispatch),
    timeoutMs: 25_000,
  };
  const llmDeps = {
    primary: scriptedLlm,
    fallback: scriptedLlm,
    dispatch: brandProviderDispatch(llmDispatch),
    timeoutMs: 25_000,
  };
  const routes = buildIntakeRoutes(() => ({ registry, draftSecret, priceSheet, speechDeps, llmDeps, audioMetadataVerifier: verifyAudioMetadata }));
  cached = routes;
  return routes;
}
