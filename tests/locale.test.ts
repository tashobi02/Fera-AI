import { describe, expect, it } from "vitest";
import { DEFAULT_LOCALE, isLocale, localeCookieOptions, resolveLocale, supportedLocales } from "@/lib/locale";
import { locales } from "@/locales";

describe("resolveLocale", () => {
  it("defaults to Bangla (FR-033)", () => {
    expect(DEFAULT_LOCALE).toBe("bn");
    expect(resolveLocale(undefined)).toBe("bn");
    expect(resolveLocale(null)).toBe("bn");
    expect(resolveLocale("")).toBe("bn");
  });

  it("accepts exactly the supported codes", () => {
    expect(resolveLocale("bn")).toBe("bn");
    expect(resolveLocale("en")).toBe("en");
  });

  it("falls back to Bangla for anything else", () => {
    for (const value of ["EN", "en-US", " en", "fr", "bn-BD", 1, {}, ["en"]]) {
      expect(resolveLocale(value)).toBe("bn");
    }
  });
});

describe("isLocale", () => {
  it("accepts every defined locale", () => {
    for (const locale of Object.keys(locales)) expect(isLocale(locale)).toBe(true);
    expect(supportedLocales).toEqual(["bn", "en"]);
  });

  it("rejects unknown codes and inherited property names", () => {
    for (const value of ["de", "constructor", "__proto__", "toString", "hasOwnProperty", undefined, 0]) {
      expect(isLocale(value)).toBe(false);
    }
  });
});

describe("localeCookieOptions", () => {
  const base = { path: "/", maxAge: 31_536_000, sameSite: "lax", httpOnly: true };

  it("is Secure in production", () => {
    expect(localeCookieOptions({ NODE_ENV: "production" })).toEqual({ ...base, secure: true });
  });

  it("is not Secure on the DEMO_MODE laptop stack or in development", () => {
    expect(localeCookieOptions({ NODE_ENV: "production", DEMO_MODE: "1" })).toEqual({ ...base, secure: false });
    expect(localeCookieOptions({ NODE_ENV: "development" })).toEqual({ ...base, secure: false });
  });
});
