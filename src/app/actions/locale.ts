"use server";

import { cookies } from "next/headers";
import { isLocale, LOCALE_COOKIE, localeCookieOptions } from "@/lib/locale";

// ACT-030. Writes nothing unless the input is a FormData carrying a supported
// locale. Validation uses isLocale until zod is a declared dependency.
export async function setLocale(formData: FormData): Promise<void> {
  if (!(formData instanceof FormData)) return;
  const value = formData.get("locale");
  if (!isLocale(value)) return;
  (await cookies()).set(LOCALE_COOKIE, value, localeCookieOptions());
}
