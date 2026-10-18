// SCREEN-002 seam to API-001 (transcribe) and API-002 (extract) (TASK-021; D2A §5.5).
//
// The UI talks to an IntakeClient. The default for production is the live HTTP
// client (`./http-client`); tests inject the labelled fake (`./fakes/fake-client`,
// client.mock = true, shown as [MOCK]). Both live behind the same IntakeClient
// surface; the screen never needs to know which it has.
//
// A client never throws: every failure is a catalogue error envelope (D2B §13),
// so the screen shows catalogue copy only, never response text.
//
// P3-035: the canonical implementation moved to ./http-client. This file
// re-exports the surface so existing imports (intake-chat, voice-recorder, the
// tests) keep working without an import-path rewrite.
export {
  AUDIO_PART,
  EXTRACT_API,
  PROVIDER_NOTICE_HEADER,
  PROVIDER_NOTICE_VALUE,
  TRANSCRIBE_API,
  createHttpIntakeClient,
  durationField,
  failure,
  noticeGated,
  statusError,
  type IntakeClient,
  type IntakeResult,
  type TranscribeInput,
} from "./http-client";
