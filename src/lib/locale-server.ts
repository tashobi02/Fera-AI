import { cookies } from "next/headers";
import { LOCALE_COOKIE, resolveLocale } from "@/lib/locale";
import type { Locale } from "@/locales";

export async function getLocale(): Promise<Locale> {
  return resolveLocale((await cookies()).get(LOCALE_COOKIE)?.value);
}
