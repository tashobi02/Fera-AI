import { describe, expect, it } from "vitest";
import { ERROR_CATALOGUE } from "@/contracts";
import { languageNames, locales } from "@/locales";

describe("locales", () => {
  it("defines every key in both Bangla and English", () => {
    expect(Object.keys(locales.en).sort()).toEqual(Object.keys(locales.bn).sort());
  });

  it("has no empty strings", () => {
    for (const lang of [locales.bn, locales.en]) {
      for (const value of Object.values(lang)) expect(value.trim()).not.toBe("");
    }
  });

  it("keeps the D4 §15.1 demo banner copy exact", () => {
    expect(locales.bn.demoBanner).toBe("সিনথেটিক তথ্য · কর্মকর্তা যাচাই সিমুলেশন");
    expect(locales.en.demoBanner).toBe("Synthetic data · officer verification simulated");
  });

  it("names the COMP-022 toggle options exactly as D3 shows them", () => {
    expect(`${languageNames.bn} | ${languageNames.en}`).toBe("বাংলা | English");
  });

  it("uses Bangla numerals, never Latin digits, in Bangla strings", () => {
    for (const value of Object.values(locales.bn)) expect(value).not.toMatch(/[0-9]/);
  });

  // TASK-031: SCREEN-008 and SCREEN-016 strings.
  it.each([
    "signInTitle", "signInTitleStaff", "signInTitleOfficer", "signInTitleAdmin", "signInIntro", "signInReturnNote",
    "usernameLabel", "passwordLabel", "usernameRequired", "passwordRequired", "showPasswordButton", "hidePasswordButton",
    "showPasswordLabel", "hidePasswordLabel", "signInAction", "signingIn", "signedInRedirecting", "signInErrorCredentials",
    "signInErrorRateLimited", "signInErrorRateLimitedSoon", "signInErrorGeneric", "demoAccountsTitle", "mockLabel",
    "demoAccountsNote", "demoAccountFill", "demoRoleStaff", "demoRoleOfficer", "demoRoleOfficerUnverified", "demoRoleAdmin",
    "signOutAction", "signingOut", "notFoundTitle", "notFoundHint", "notFoundHome",
  ] as const)("defines %s in Bangla and English", (key) => {
    expect(locales.bn[key].trim()).not.toBe("");
    expect(locales.en[key].trim()).not.toBe("");
  });

  it("keeps the exact D3/D4 sign-in and not-found copy", () => {
    expect([locales.bn.signInAction, locales.en.signInAction]).toEqual(["সাইন ইন", "Sign in"]); // D3 ACT-018
    expect([locales.bn.signInErrorCredentials, locales.en.signInErrorCredentials]).toEqual([
      "ইউজারনেম বা পাসওয়ার্ড ঠিক নয়",
      "Username or password is incorrect",
    ]); // D3 SCREEN-008 E-002
    expect([locales.bn.signInTitleOfficer, locales.en.signInTitleOfficer]).toEqual(["কর্মকর্তা সাইন ইন", "Officer sign-in"]); // D4 §14
    expect([locales.bn.signOutAction, locales.en.signOutAction]).toEqual(["সাইন আউট", "Sign out"]); // D4 §5
    expect([locales.bn.notFoundTitle, locales.en.notFoundTitle]).toEqual(["তথ্যটি পাওয়া যায়নি।", "We couldn't find that."]); // D3 SCREEN-016
  });

  it("matches the D2B §13 catalogue for the reused error messages", () => {
    expect(locales.bn.notFoundTitle).toBe(ERROR_CATALOGUE["E-004"].bn);
    expect(locales.en.notFoundTitle).toBe(ERROR_CATALOGUE["E-004"].en);
    expect(locales.bn.signInErrorRateLimited).toBe(ERROR_CATALOGUE["E-007"].bn);
    expect(locales.en.signInErrorRateLimited).toBe(ERROR_CATALOGUE["E-007"].en);
    expect(locales.bn.signInErrorGeneric).toBe(ERROR_CATALOGUE["E-021"].bn);
    expect(locales.en.signInErrorGeneric).toBe(ERROR_CATALOGUE["E-021"].en);
  });

  it("keeps the toggle's visible word inside its accessible name (WCAG 2.5.3)", () => {
    for (const t of [locales.bn, locales.en]) {
      expect(t.showPasswordLabel).toContain(t.showPasswordButton);
      expect(t.hidePasswordLabel).toContain(t.hidePasswordButton);
    }
  });
});
