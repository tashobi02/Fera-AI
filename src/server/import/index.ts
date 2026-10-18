// API-015 synthetic public-import service (TASK-048, FR-024, TC-014, STORY-015).
//
// - Admin only; the route's role guard is the only access check (the service
//   defends with a second E-003 if a non-admin slips through).
// - Each item: validate text (min/max) and build a deterministic reviewed draft
//   in DEMO_MODE. No paid provider or AI adapter is wired into the default service.
//   Items are processed sequentially; the per-item transaction in
//   src/server/case/import.ts commits one row at a time so a partial batch
//   leaves committed rows visible (the task wants honest counts).
// - No URL fetch: source_url is stored as the validated example.invalid value
//   only. Prompt injection is data: the text is fed to the builder, not to any
//   system prompt; the adapter only ever sees the text as input data.
// - Fields whitelist: the reviewed draft carries only contract-approved fields.
//   Evidence spans are not produced, so provenance is `{}` for every imported row.
// - No child payload or candidate response: the only return is the
//   importResponseSchema (imported / skipped / duplicates_flagged).
// - With DEMO_MODE off, the sample builder skips items; no paid request is made.
//   DEMO_MODE sample values are deterministic and labelled simulated.
// - Unknown / unparseable records skip with honest counts. There is no
//   silent fall-back and no guessed field.
import { ApiError } from "@/app/api/_shared/envelope";
import {
  importRequestSchema,
  importResponseSchema,
  type ImportResponse,
  type CaseKind,
  type MissingSubmissionDraft,
  type FoundSubmissionDraft,
} from "@/contracts";
import type { Principal } from "@/contracts/server";
import { processPublicImportItem, type PublicImportItemResult, type PublicImportContext } from "@/server/case/import";
import { buildSampleDraft, type SampleBuilder, type SampleBuilderResult } from "./builder";
import { computeDuplicatesFlagged } from "./duplicates";

export type ImportDeps = {
  // Builder seam. The default builds a deterministic reviewed draft from the
  // text + kind + request fixture timestamp (DEMO_MODE path). Tests may inject a fake.
  builder: SampleBuilder;
  // Pool/transaction context seam (so tests can use a noop).
  context?: PublicImportContext;
  // Optional internal seam; defaultDeps leaves it null and does not call a provider.
  paidProvider: null | ((text: string, kind: CaseKind) => Promise<{ ok: true; draft: MissingSubmissionDraft | FoundSubmissionDraft } | { ok: false; reason: "invalid_text" | "invalid_draft" | "refused" | "no_provider" }>);
};

const defaultDeps = (env: NodeJS.ProcessEnv): ImportDeps => ({
  builder: buildSampleDraft(env.DEMO_MODE === "1"),
  paidProvider: null,
});

export type ImportServiceOptions = {
  env?: NodeJS.ProcessEnv;
  deps?: Partial<ImportDeps>;
};

export async function importSyntheticCases(
  principal: Principal | null,
  input: unknown,
  opts: ImportServiceOptions = {},
): Promise<ImportResponse> {
  if (!principal || principal.kind !== "user" || principal.role !== "admin" || !principal.isActive) {
    throw new ApiError("E-003", { reason: "authorize" });
  }
  const request = importRequestSchema.parse(input);
  const env = opts.env ?? process.env;
  const deps: ImportDeps = { ...defaultDeps(env), ...(opts.deps ?? {}) };
  const ctx: PublicImportContext = deps.context ?? {};
  const nowIso = request.fixture_intake_at;

  const results: PublicImportItemResult[] = [];
  for (const item of request.items) {
    const perItem = await runOne(principal, item, request.kind, nowIso, deps, ctx);
    results.push(perItem);
  }
  // Count only the persisted duplicate flag emitted by the case service.
  // Submitted text is never hashed; the response exposes no IDs and no
  // case payload.
  const duplicates_flagged = computeDuplicatesFlagged(results);
  const imported = results.filter((r) => r.kind === "imported").length;
  const skipped = results.filter((r) => r.kind === "skipped").length;
  return importResponseSchema.parse({ imported, skipped, duplicates_flagged });
}

async function runOne(
  principal: Principal,
  item: { text: string; source_url: string; synthetic: true },
  kind: CaseKind,
  nowIso: string,
  deps: ImportDeps,
  ctx: PublicImportContext,
): Promise<PublicImportItemResult> {
  if (deps.paidProvider !== null) {
    const r = await deps.paidProvider(item.text, kind);
    if (r.ok) {
      return processPublicImportItem(
        principal,
        { text: item.text, sourceUrl: item.source_url, kind },
        () => ({ ok: true, draft: r.draft }),
        nowIso,
        ctx,
      );
    }
    if (r.reason === "no_provider") {
      return { kind: "skipped", reason: "no_provider" };
    }
    if (r.reason === "refused") {
      return { kind: "skipped", reason: "no_provider" };
    }
    if (r.reason === "invalid_text") return { kind: "skipped", reason: "invalid_text" };
    return { kind: "skipped", reason: "invalid_draft" };
  }
  // DEMO_MODE path: deterministic reviewed sample, labelled simulated. The
  // builder is the source of field values; no AI adapter is called. Persist
  // through the per-item case service so provenance and audit rules still apply.
  return processPublicImportItem(
    principal,
    { text: item.text, sourceUrl: item.source_url, kind },
    (text, kindArg) => {
      const built: SampleBuilderResult = deps.builder(text, kindArg, nowIso);
      if (built.ok) return { ok: true, draft: built.draft };
      if (built.reason === "invalid_text") return { ok: false, reason: "invalid_text" };
      return { ok: false, reason: "invalid_draft" };
    },
    nowIso,
    ctx,
  );
}
