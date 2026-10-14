// Server-only contracts: principals, the permission matrix, role projections, audit
// projection, submission idempotency and hashing, intake metadata. Never import this
// from client components (it uses node:crypto; an ESLint rule guards app/client code).
export * from "./rows";
export * from "./principal";
export * from "./projections";
export * from "./submission";
export * from "./intake";
