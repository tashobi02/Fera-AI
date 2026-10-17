import type { Metadata } from "next";
import { getLocale } from "@/lib/locale-server";
import { locales } from "@/locales";
import { ManualForm } from "./manual-form";

// SCREEN-005 /intake/form (TASK-025). The form is client-only: it works on the
// device-local draft and hands the parent to S-003 to confirm and submit.
export async function generateMetadata(): Promise<Metadata> {
  return { title: locales[await getLocale()].manualFormTitle };
}
export default async function ManualFormPage() {
  return <ManualForm locale={await getLocale()} />;
}
