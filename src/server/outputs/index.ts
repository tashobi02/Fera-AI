// Output generator (COMP-010, TASK-023) behind API-006. Server-only.
//
//   const out = await getOutput(principal, caseId, "gd", { requestId });
//
// - The case is read with `readCase`, which checks ownership and returns the owner
//   projection; absent or not-owned is E-004 (the API layer writes access.denied).
// - Outputs are cached per (case, type, version) in `generated_outputs` (BR-022, D2A
//   API-006): the same version always gets the same text, and a newer version gets new
//   text. An insert race keeps the first row (ON CONFLICT DO NOTHING) and serves it.
// - Every text passes the wording guard before it is stored and again before it is
//   served, so a term added to the list later also blocks older cached rows (E-016).
// - When the owner view has no draft (edit-locked or redacted report), nothing is served,
//   not even a cached row, because the view hides that payload (BR-025): E-016 (OD-023-2).
// - The output transaction re-reads the case FOR SHARE, which waits for redact_case (FOR
//   UPDATE), owner edits and decisions. If the report was redacted, edited or locked since
//   `readCase`, nothing is served or written and the call is E-016 (a retry reads the new
//   state). Without this, an insert could land after redact_case deleted the outputs and
//   keep child text.
import { EDITABLE_STATUSES, OUTPUT_DRAFT_LABEL_BN, countWords, toDhakaIso, type OutputResponse } from "@/contracts";
import type { Principal } from "@/contracts/server";
import { ApiError } from "@/app/api/_shared/envelope";
import { readCase, type ServiceContext } from "@/server/case";
import { txOptions, withTransaction } from "@/server/case/internal";
import { col, firstRow } from "@/server/db/decode";
import type { Queryable } from "@/server/db/queryable";
import { assertAllowedWording } from "./guard";
import { TEMPLATES, type TemplateInput, type TemplateType } from "./templates";

export { assertAllowedWording, findBannedGroup, BANNED_TERMS } from "./guard";
export type { TemplateType } from "./templates";

type Stored = { text: string; createdAt: Date };

function decodeStored(rows: readonly unknown[]): Stored | null {
  const r = firstRow("generated_outputs", rows);
  if (!r) return null;
  const createdAt = col.dateOrNull("generated_outputs", r, "created_at");
  if (!createdAt) return null;
  return { text: col.text("generated_outputs", r, "text_bn"), createdAt };
}

async function cached(db: Queryable, caseId: string, type: TemplateType, version: number): Promise<Stored | null> {
  const { rows } = await db.query(
    "SELECT text_bn, created_at FROM generated_outputs WHERE case_id = $1 AND type = $2 AND case_version = $3",
    [caseId, type, version],
  );
  return decodeStored(rows);
}

async function districtNameBn(db: Queryable, code: number | null): Promise<string | null> {
  if (code === null) return null;
  const { rows } = await db.query("SELECT name_bn FROM districts WHERE code = $1", [code]);
  const r = firstRow("districts", rows);
  return r ? col.text("districts", r, "name_bn") : null;
}

export function renderOutput(type: TemplateType, input: TemplateInput): string {
  const text = TEMPLATES[type](input);
  assertAllowedWording(text);
  return text;
}

export async function getOutput(
  principal: Principal,
  caseId: string,
  type: TemplateType,
  ctx: ServiceContext = {},
): Promise<OutputResponse> {
  const read = await readCase(principal, caseId, ctx);
  if (read.kind === "hidden") throw new ApiError("E-004", { caseId: read.caseId ?? undefined });
  if (read.view.view !== "owner") throw new ApiError("E-004", { caseId });
  const view = read.view.data;
  const draft = view.draft;
  if (draft === null) throw new ApiError("E-016");

  const stored = await withTransaction(async (client) => {
    const live = await client.query(
      // Same visibility rule as the owner projection (ownPayloadVisible), at this version.
      "SELECT 1 FROM cases WHERE id = $1 AND version = $2 AND anonymised_at IS NULL AND status = ANY($3::case_status[]) FOR SHARE",
      [view.id, view.version, EDITABLE_STATUSES],
    );
    if (live.rows.length === 0) return null;
    const hit = await cached(client, view.id, type, view.version);
    if (hit) return hit;
    const text = renderOutput(type, {
      refCode: view.ref_code,
      draft,
      districtNameBn: await districtNameBn(client, draft.event.district_code),
    });
    const { rows } = await client.query(
      `INSERT INTO generated_outputs (case_id, type, text_bn, case_version) VALUES ($1, $2, $3, $4)
       ON CONFLICT (case_id, type, case_version) DO NOTHING RETURNING text_bn, created_at`,
      [view.id, type, text, view.version],
    );
    return decodeStored(rows) ?? (await cached(client, view.id, type, view.version));
  }, txOptions(ctx));

  if (!stored) throw new ApiError("E-016");
  assertAllowedWording(stored.text);
  return {
    type,
    text_bn: stored.text,
    label_bn: OUTPUT_DRAFT_LABEL_BN,
    word_count: countWords(stored.text),
    generated_at: toDhakaIso(stored.createdAt.getTime()),
  };
}
