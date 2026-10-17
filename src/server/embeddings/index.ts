// COMP-011 embedding service (TASK-016). See model.ts for the pinned model and text.ts
// for what is embedded.
export {
  EMBEDDING,
  EMBEDDING_DIM,
  EmbeddingNotConfiguredError,
  MODEL_DTYPE,
  POOLING_OPTIONS,
  PREFIX,
  ROLE_BY_KIND,
  TEXT_RECIPE,
  buildSpace,
  verifyModelCache,
  defaultCacheDir,
  embedText,
  getEmbedder,
  MODEL_FILES,
  loadLocalEmbedder,
  setEmbedder,
} from "./model";
export type { Embedder, EmbeddingRole, ModelFile, SpaceInputs } from "./model";
export { caseEmbeddingText } from "./text";
export type { CaseTextFields, CaseTextInput, DraftLike } from "./text";
