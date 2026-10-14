// Client-safe shared contracts (TASK-061): schemas, types, enums, errors and labels.
// Server-only pieces (principals, projections, hashing, intake metadata) live in
// `@/contracts/server`; typed fakes live in `@/contracts/examples` (tests and fakes only).
// Frozen at G1 as contracts-v1 after review and merge; later changes need a PR
// reviewed by all three owners.
export * from "./primitives";
export * from "./states";
export * from "./errors";
export * from "./draft";
export * from "./schemas";
