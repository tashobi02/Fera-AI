// Backwards-compatible re-export. The draft metadata registry moved to
// `./registry` so the production getDeps() can use a DB-backed implementation
// while unit tests inject the in-memory variant through the async interface.
export * from "./registry";
