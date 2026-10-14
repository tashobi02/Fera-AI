import { expect, it } from "vitest";
import type * as C from "../../docs/code/fera_types_v2";
import type * as K from "@/contracts";
import type * as S from "@/contracts/server";

// Compile-time checks, enforced by `npm run typecheck`: every runtime DTO is a
// valid instance of its fera_types_v2.ts companion shape. Where the companion is
// wider (e.g. ErrorEnvelope.id: string) only this direction is required.
type Extends<A, B> = [A] extends [B] ? true : false;
type Same<A, B> = Extends<A, B> extends true ? Extends<B, A> : false;
const check = <T extends true>() => true as T;

check<Same<K.CaseKind, C.CaseKind>>();
check<Same<K.CaseStatus, C.CaseStatus>>();
check<Same<K.MissingStatus, C.MissingStatus>>();
check<Same<K.FoundStatus, C.FoundStatus>>();
check<Same<K.StatusGroup, C.StatusGroup>>();
check<Same<K.Sex, C.Sex>>();
check<Same<K.CaseSource, C.CaseSource>>();
check<Same<K.UserRole, C.UserRole>>();
check<Same<K.CandidateStatus, C.CandidateStatus>>();
check<Same<K.Outcome, C.Outcome>>();
check<Same<K.DuplicateStatus, C.DuplicateStatus>>();
check<Same<K.MatchingState, C.MatchingState>>();
check<Same<K.OutputType, C.OutputType>>();

check<Same<K.EvidenceSpan, C.EvidenceSpan>>();
check<Same<K.CaseDraft, C.CaseDraft>>();
check<Extends<K.MissingSubmissionDraft, C.CaseDraft>>();
check<Extends<K.FoundSubmissionDraft, C.CaseDraft>>();
check<Same<K.OwnerCaseView, C.OwnerCaseView>>();
check<Same<K.StaffOwnCaseView, C.StaffOwnCaseView>>();
// Wider than the companion (CN-05) and synthetic-only (CN-08); still a valid instance.
check<Extends<K.OfficerCaseView, C.OfficerCaseView>>();
check<Same<K.AdminCaseView, C.AdminCaseView>>();
// missing_fields / next_question.field narrowed to draft field paths (C13).
check<Extends<K.ExtractResponse, C.ExtractResponse>>();
check<Same<K.TranscribeResponse, C.TranscribeResponse>>();
check<Extends<K.OutputResponse, C.OutputResponse>>();
check<Same<K.DecisionRequest, C.DecisionRequest>>();
// Adds endpoint versions and narrows statuses per kind (CN-11).
check<Extends<K.DecisionResponse, C.DecisionResponse>>();
check<Same<K.DashboardStatsResponse, C.DashboardStatsResponse>>();
check<Extends<K.CreateMissingRequest, C.CreateMissingRequest>>();
check<Extends<K.CandidateDecisionView, C.CandidateDecisionView>>();
check<Extends<K.DuplicateDecisionRequest, C.DuplicateDecisionRequest>>();
check<Same<K.RematchResponse, C.RematchResponse>>();
check<Extends<K.ErrorEnvelope, C.ErrorEnvelope>>();
check<Same<S.IntakeDraftMetadata, C.IntakeDraft>>();
check<Same<K.DecisionType, C.DecisionType>>();
check<Same<K.ActorType, C.ActorType>>();
check<Same<K.Uuid, C.Uuid>>();
check<Same<K.IsoDateTime, C.IsoDateTime>>();
check<Extends<K.NextQuestion, C.NextQuestion>>();
check<Same<K.DistrictStats, C.DistrictStats>>();
// Hand-written server rows stay equal to the companion entities.
check<Same<S.CaseRow, Omit<C.Case, "embedding">>>();
check<Extends<C.User, S.UserRow>>();
check<Extends<C.ParentSession, S.ParentSessionRow>>();
check<Same<Omit<S.AuditRow, "actor_display">, Omit<C.AuditEntry, "id" | "request_id">>>();
check<Extends<K.OfficerCaseRow, C.OfficerCaseView>>();
check<Extends<K.QueueCandidate["counterpart"], C.OfficerCaseView>>();

it("type companion checks compile", () => {
  expect(true).toBe(true);
});
