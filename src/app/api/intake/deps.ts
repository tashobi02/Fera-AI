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
//
// Lazy initialization: route.ts calls getIntakeRouteDeps() at module load to
// assign `export const POST`. The build is deferred to the first request so
// a missing DRAFT_SIGNING_KEY (or any other init error) is mapped to a
// request-scoped E-021 envelope by defineRoute's error path instead of
// escaping at module load and bypassing the envelope entirely. The
// `defineRoute` factory's auth/throttling/schema wiring is preserved — only
// the env-driven init moves inside the per-request closure.
import { brandSttDispatch, type RawSttDispatch, type SttProvider } from "@/server/speech/types";
import { brandProviderDispatch, type LLMProvider, type RawDispatch } from "@/server/ai";
import { UNKNOWN_PRICE_SHEET, type PriceSheet } from "@/server/spend";
import {
  createDraftSigner,
  createDbDraftRegistry,
  verifyDraftToken,
  type DraftRegistry,
} from "@/server/intake/registry";
import { verifyAudioMetadata } from "@/server/intake/audio-metadata";
import { loadSecret, SecretConfigError } from "@/server/auth/secrets";
import { buildIntakeRoutes } from "./route-helpers";
import { ApiError } from "@/app/api/_shared";
import type { IntakeRouteDeps } from "./route-helpers";

const scriptedStt: SttProvider = {
  name: "[MOCK] intake.default",
  async transcribe() {
    return { text: "[MOCK] আমার ছেলে রাফি, বয়স ১৩" };
  },
};

const scriptedLlm: LLMProvider = {
  name: "[MOCK] intake.default",
  async extract() {
    // A scripted stub must never masquerade as a successful extraction:
    // returning `ok:true` with `draft:undefined` would silently commit an
    // empty draft and pass the route envelope check. Surface a provider
    // failure instead so callers see E-013 / E-021, never a phantom success.
    return { ok: false as const, error: "E-013" as const };
  },
};

const speechDispatch: RawSttDispatch = (provider, audio, options) => provider.transcribe(audio, options);
const llmDispatch: RawDispatch = (provider, request, options) => provider.extract(request, options);

type BuiltRoutes = ReturnType<typeof buildIntakeRoutes>;

// Lazy-built deps. The closure is what `defineRoute`'s handler calls per
// request, so an init error thrown here is caught by the route factory and
// surfaced as a normal E-021 envelope.
let cachedDeps: IntakeRouteDeps | null = null;

function buildDepsOrThrow(): IntakeRouteDeps {
  if (cachedDeps) return cachedDeps;
  // Env-driven init: any throw (missing DRAFT_SIGNING_KEY, registry ctor
  // error, DB pool failure) propagates up and is caught by the route factory
  // when the closure is invoked from a request handler.
  const draftSecret = loadSecret("DRAFT_SIGNING_KEY");
  const signer = createDraftSigner(draftSecret);
  // Production uses the DB-backed registry so runPaidCall's reservations are
  // reflected authoritatively across processes. Unit tests inject the
  // in-memory variant through their own getDeps closure.
  const registry: DraftRegistry = createDbDraftRegistry({
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
  cachedDeps = { registry, draftSecret, priceSheet, speechDeps, llmDeps, audioMetadataVerifier: verifyAudioMetadata };
  return cachedDeps;
}

export function getIntakeRouteDeps(): BuiltRoutes {
  // The closure passed to buildIntakeRoutes is invoked from the route
  // factory's handler on every request, so init errors land inside
  // defineRoute's try/catch and become E-021 envelopes instead of unhandled
  // module-load throws. Auth, rate-limit, body schema and role-guard logic
  // are unchanged: only the env-driven deps are deferred.
  return buildIntakeRoutes(() => {
    try {
      return buildDepsOrThrow();
    } catch (err) {
      if (err instanceof SecretConfigError) {
        // Map the configuration error to a request-scoped ApiError. The
        // envelope only carries the error id; the reason is logged separately.
        throw new ApiError("E-021");
      }
      throw err;
    }
  });
}

// Exposed for tests so they can reset the lazy cache between scenarios.
export function __resetIntakeRouteDepsForTest(): void {
  cachedDeps = null;
}
