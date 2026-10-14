"use server";

import { cookies } from "next/headers";
import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, resolveLocale } from "@/lib/locale";

// ACT-030. A UI preference, not identity: no `secure` flag, because the finale
// laptop stack may be reached over plain HTTP on the local network.
export async function setLocale(formData: FormData): Promise<void> {
  const locale = resolveLocale(formData.get("locale"));
  (await cookies()).set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: LOCALE_COOKIE_MAX_AGE,
    sameSite: "lax",
    httpOnly: true,
  });
}
