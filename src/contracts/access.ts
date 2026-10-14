// Client-safe permission helpers (pure functions, no node:crypto) for server components
// and UI that need to hide controls. They never replace the route's own check, and
// principals can still only be minted on the server.
export { API_ACCESS, API_IDS, canCall, canIntake, effectiveRole } from "./server/principal";
export type { ApiId, EffectiveRole, Principal } from "./server/principal";
