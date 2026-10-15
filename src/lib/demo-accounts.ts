// Client-safe types for the SCREEN-008 demo account hint. The list itself is decided on
// the server (src/server/auth/demo-accounts.ts).
export type DemoAccountRole = "staff" | "officer" | "officer-unverified" | "admin";
export type DemoAccount = { username: string; role: DemoAccountRole };
