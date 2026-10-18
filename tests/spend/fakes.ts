import { randomUUID } from "node:crypto";
import { fakePool, pgError } from "../case/fakes";
import { captureLogs } from "../api/fakes";
import { testParent } from "../support/principals";
import type { ReservationRequest } from "@/server/spend";
import { mockEstimate } from "./estimates";

export { pgError };
export const draftId = randomUUID();
export const reservationId = randomUUID();
export const principal = testParent(randomUUID());
export const request: ReservationRequest = { apiId: "API-002", draftId, expectedRevision: 1, upperUsd: mockEstimate(), kind: "missing" };

export function spendFake(opts: { revision?: number; hidden?: boolean; hiddenAfterReserve?: boolean; reserveError?: Error; settleError?: Error; constraintsError?: Error; commitError?: Error; settleCommitError?: Error } = {}) {
  const logs = captureLogs();
  const fake = fakePool([
    { match: /reserve_ai_call/, reply: () => opts.reserveError ?? [{ id: reservationId }] },
    { match: /SELECT 1 FROM intake_drafts/, reply: () => opts.hidden ? [] : [{ "?column?": 1 }] },
    { match: /SELECT revision FROM intake_drafts/, reply: () => opts.hiddenAfterReserve ? [] : [{ revision: opts.revision ?? 2 }] },
    { match: /settle_ai_call/, reply: () => opts.settleError ?? [] },
    { match: /^SET CONSTRAINTS ALL IMMEDIATE$/, reply: () => opts.constraintsError ?? [] },
    { match: /^COMMIT$/, reply: (_, calls) => opts.commitError ?? (calls.some((c) => /settle_ai_call/.test(c.text)) ? opts.settleCommitError ?? [] : []) },
  ]);
  return { ...fake, ctx: { pool: fake.pool, logger: logs.logger }, logs };
}
