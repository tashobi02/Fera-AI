// Client-safe typed fakes for UI lanes: the DTO values of examples.ts, stored as JSON
// so importing them pulls in no server code. Requests are validated and returned as
// the client would send them (z.input); responses are parsed (z.output).
// tests/contracts/client-examples.test.ts keeps client-examples.json in sync.
import type { z } from "zod";
import data from "./client-examples.json";
import { errorEnvelopeSchema } from "./errors";
import * as s from "./schemas";

function input<S extends z.ZodType>(schema: S, value: unknown): z.input<S> {
  schema.parse(value);
  return value as z.input<S>; // validated above; JSON loses literal types only
}
function output<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  return schema.parse(value);
}

export const clientExamples = {
  transcribeFields: input(s.transcribeFieldsSchema, data.transcribeFields),
  transcribeResponse: output(s.transcribeResponseSchema, data.transcribeResponse),
  extractRequest: input(s.extractRequestSchema, data.extractRequest),
  extractFollowUpRequest: input(s.extractRequestSchema, data.extractFollowUpRequest),
  extractResponse: output(s.extractResponseSchema, data.extractResponse),
  createMissingRequest: input(s.createMissingRequestSchema, data.createMissingRequest),
  createMissingResponse: output(s.createMissingResponseSchema, data.createMissingResponse),
  ownerCaseView: output(s.ownerCaseViewSchema, data.ownerCaseView),
  staffOwnCaseView: output(s.staffOwnCaseViewSchema, data.staffOwnCaseView),
  officerMissingView: output(s.officerCaseViewSchema, data.officerMissingView),
  officerFoundView: output(s.officerCaseViewSchema, data.officerFoundView),
  adminCaseView: output(s.adminCaseViewSchema, data.adminCaseView),
  updateCaseRequest: input(s.updateCaseRequestSchema, data.updateCaseRequest),
  outputRequest: input(s.outputRequestSchema, data.outputRequest),
  outputResponse: output(s.outputResponseSchema, data.outputResponse),
  createFoundRequest: input(s.createFoundRequestSchema, data.createFoundRequest),
  createFoundResponse: output(s.createFoundResponseSchema, data.createFoundResponse),
  reviewQueueQuery: input(s.reviewQueueQuerySchema, data.reviewQueueQuery),
  reviewQueueResponse: output(s.reviewQueueResponseSchema, data.reviewQueueResponse),
  candidateDecisionView: output(s.candidateDecisionViewSchema, data.candidateDecisionView),
  confirmDecisionRequest: input(s.decisionRequestSchema, data.confirmDecisionRequest),
  rejectDecisionRequest: input(s.decisionRequestSchema, data.rejectDecisionRequest),
  confirmDecisionResponse: output(s.decisionResponseSchema, data.confirmDecisionResponse),
  rejectDecisionResponse: output(s.decisionResponseSchema, data.rejectDecisionResponse),
  closeCaseRequest: input(s.closeCaseRequestSchema, data.closeCaseRequest),
  closeCaseResponse: output(s.closeCaseResponseSchema, data.closeCaseResponse),
  dashboardStatsResponse: output(s.dashboardStatsResponseSchema, data.dashboardStatsResponse),
  officerAuditResponse: output(s.officerAuditResponseSchema, data.officerAuditResponse),
  adminAuditResponse: output(s.adminAuditResponseSchema, data.adminAuditResponse),
  rematchResponse: output(s.rematchResponseSchema, data.rematchResponse),
  importRequest: input(s.importRequestSchema, data.importRequest),
  importResponse: output(s.importResponseSchema, data.importResponse),
  anonymiseRequest: input(s.anonymiseRequestSchema, data.anonymiseRequest),
  anonymiseResponse: output(s.anonymiseResponseSchema, data.anonymiseResponse),
  verifyUserRequest: input(s.verifyUserRequestSchema, data.verifyUserRequest),
  verifyUserResponse: output(s.verifyUserResponseSchema, data.verifyUserResponse),
  myCaseResponse: output(s.myCaseResponseSchema, data.myCaseResponse),
  healthResponse: output(s.healthResponseSchema, data.healthResponse),
  signInRequest: input(s.signInRequestSchema, data.signInRequest),
  sessionView: output(s.sessionViewSchema, data.sessionView),
  pageQuery: input(s.pageQuerySchema, data.pageQuery),
  adminUsersResponse: output(s.adminUsersResponseSchema, data.adminUsersResponse),
  caseListQuery: input(s.caseListQuerySchema, data.caseListQuery),
  caseListResponse: output(s.caseListResponseSchema, data.caseListResponse),
  duplicateDecisionRequest: input(s.duplicateDecisionRequestSchema, data.duplicateDecisionRequest),
  duplicateDecisionResponse: output(s.duplicateDecisionResponseSchema, data.duplicateDecisionResponse),
  errorEnvelope: output(errorEnvelopeSchema, data.errorEnvelope),
};
