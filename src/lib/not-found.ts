// SCREEN-016 rules (D3 SCREEN-016, §7 row 9; BR-010; D2B E-004).
//
// One screen answers both a missing or hidden record (E-004) and a role error (E-003),
// so it can never confirm that a record or an area exists. What it shows depends only on
// who is looking (their surface and home link), never on why they were refused.
import type { EffectiveRole } from "@/contracts/access";
import { roleHome } from "@/lib/auth-paths";

export const NOT_FOUND_ERROR_IDS = ["E-003", "E-004"] as const;

// Desk screens that receive one of these from an API render SCREEN-016.
export function showsNotFoundScreen(errorId: string): boolean {
  return (NOT_FOUND_ERROR_IDS as readonly string[]).includes(errorId);
}

export type NotFoundView = { surface: "desk" | "parent"; home: string };

// Signed-out visitors and parents get the parent surface (Paper, no red) and "/".
export function notFoundView(role: EffectiveRole | null): NotFoundView {
  if (role === "staff" || role === "officer" || role === "admin") return { surface: "desk", home: roleHome(role) };
  return { surface: "parent", home: "/" };
}
