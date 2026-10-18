import type { Metadata } from "next";
// SCREEN-005 — manual case form (TASK-025; D3 SCREEN-005, FR-026, TC-017). The
// fallback when AI fails or is unavailable (D3:121-133). P3-013 thin path: the
// server only sets locale + metadata; the client reads the device-local draft,
// reuses S-003 review fields/submit, and never carries a child payload in the URL.
import { getLocale } from "@/lib/locale-server";
import { locales } from "@/locales";
import { ManualFormScreen } from "./manual-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: locales[await getLocale()].manualFormTitle };
}

export default async function ManualFormPage() {
  return <ManualFormScreen locale={await getLocale()} />;
}
