export {
  createSttAdapter,
  STT_DEFAULT_TIMEOUT_MS,
  STT_MAX_TIMEOUT_MS,
  type SttAdapterOptions,
} from "./adapter";

export {
  brandSttDispatch,
  DispatchRefused,
  SttFailure,
  SttTimeoutError,
  type RawSttDispatch,
  type SttDispatch,
  type SttErrorId,
  type SttFailureReason,
  type SttLogEntry,
  type SttOutcome,
  type SttProvider,
  type SttResult,
  type TranscribeResult,
} from "./types";
