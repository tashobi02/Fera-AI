// SCREEN-002 Intake chat (TASK-021; P3-035). Parent, no account. The default is
// the live HTTP client; the labelled [MOCK] fake stays available for the
// existing test suite (tests/intake-ui/*) which sets FERA_INTAKE_CLIENT=fake
// through the test runner or injects the fake directly into IntakeChat. The
// default never silently fakes live output.
import type { Metadata } from "next";
import { getLocale } from "@/lib/locale-server";
import { locales } from "@/locales";
import { IntakeChat } from "./intake-chat";

export async function generateMetadata(): Promise<Metadata> {
  return { title: locales[await getLocale()].intakeTitle };
}

export default async function IntakePage() {
  const locale = await getLocale();
  // P3-035: the default is now live (HTTP). Tests that want the labelled fake
  // opt in via FERA_INTAKE_CLIENT=fake. The component still accepts a `mode`
  // prop so a future preview or a test runner can pin the fake without an
  // env-var race.
  return <IntakeChat locale={locale} mode={process.env.FERA_INTAKE_CLIENT === "fake" ? "fake" : "live"} />;
}
