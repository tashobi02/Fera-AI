// SCREEN-002 Intake chat (TASK-021). Parent, no account. The IntakeClient is the
// labelled fake until API-001/002 exist (TASK-014/020); FERA_INTAKE_CLIENT=live
// switches to the HTTP client once those routes are merged.
import type { Metadata } from "next";
import { getLocale } from "@/lib/locale-server";
import { locales } from "@/locales";
import { IntakeChat } from "./intake-chat";

export async function generateMetadata(): Promise<Metadata> {
  return { title: locales[await getLocale()].intakeTitle };
}

export default async function IntakePage() {
  const locale = await getLocale();
  return <IntakeChat locale={locale} mode={process.env.FERA_INTAKE_CLIENT === "live" ? "live" : "fake"} />;
}
