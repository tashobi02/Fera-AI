// Bilingual UI strings. Bangla is the parent default (FR-033); exact copy comes
// from D3/D4 where it exists. Bangla strings use Bangla numerals.
const bn = {
  appName: "ফেরা",
  demoBanner: "সিনথেটিক তথ্য · কর্মকর্তা যাচাই সিমুলেশন", // D4 §15.1 demo banner
  metaDescription: "নিখোঁজ ও পাওয়া-যাওয়া শিশুর কেস সমন্বয়ের সিনথেটিক তথ্যভিত্তিক প্রোটোটাইপ",
  demoBannerRegion: "ডেমো নোটিশ",
  languageToggleLabel: "ভাষা",
  skipToContent: "মূল অংশে যান",
  homeLink: "ফেরা — শুরুর পাতা",
  plannedLabel: "পরিকল্পিত",
  homePlaceholder: "অভিভাবক, স্টাফ ও কর্মকর্তার স্ক্রিন পরের কাজগুলোতে যুক্ত হবে।",
  // SCREEN-008 sign-in (COMP-047). D3 strings: signInAction, signInErrorCredentials.
  signInTitle: "সাইন ইন",
  signInTitleStaff: "স্টাফ সাইন ইন",
  signInTitleOfficer: "কর্মকর্তা সাইন ইন", // D4 §14
  signInTitleAdmin: "অ্যাডমিন সাইন ইন",
  signInIntro: "স্টাফ, কর্মকর্তা ও অ্যাডমিনের জন্য। অভিভাবকদের অ্যাকাউন্ট লাগে না।",
  signInReturnNote: "সাইন ইন করার পর, আপনার অনুমতি থাকলে আপনি সেই পাতায় ফিরে যাবেন।",
  usernameLabel: "ইউজারনেম",
  passwordLabel: "পাসওয়ার্ড",
  usernameRequired: "ইউজারনেম লিখুন।",
  passwordRequired: "পাসওয়ার্ড লিখুন।",
  showPasswordButton: "দেখান",
  hidePasswordButton: "লুকান",
  showPasswordLabel: "পাসওয়ার্ড দেখান",
  hidePasswordLabel: "পাসওয়ার্ড লুকান",
  signInAction: "সাইন ইন", // D3 ACT-018
  signingIn: "সাইন ইন হচ্ছে…",
  signedInRedirecting: "সাইন ইন হয়েছে। পাতা খুলছে…",
  signInErrorCredentials: "ইউজারনেম বা পাসওয়ার্ড ঠিক নয়", // D3 SCREEN-008 (E-002)
  signInErrorRateLimited: "{s} সেকেন্ড পরে আবার চেষ্টা করুন।", // D2B §13 E-007
  signInErrorRateLimitedSoon: "একটু পরে আবার চেষ্টা করুন।",
  signInErrorGeneric: "কিছু একটা ভুল হয়েছে। আবার চেষ্টা করুন।", // D2B §13 E-021
  demoAccountsTitle: "ডেমো অ্যাকাউন্ট",
  mockLabel: "[MOCK]", // honest label, same in both languages
  demoAccountsNote: "সিনথেটিক অ্যাকাউন্ট। নামে চাপ দিলে ইউজারনেম বসে যাবে। পাসওয়ার্ড এখানে দেখানো হয় না।",
  demoAccountFill: "ইউজারনেম বসান:",
  demoFilled: "ইউজারনেম বসানো হয়েছে: {u}",
  demoRoleStaff: "স্টাফ",
  demoRoleOfficer: "যাচাইকৃত কর্মকর্তা",
  demoRoleOfficerUnverified: "অযাচাইকৃত কর্মকর্তা · স্টাফের সমান অনুমতি",
  demoRoleAdmin: "অ্যাডমিন",
  // ACT-029 sign-out (D4 §5 officer nav).
  signOutAction: "সাইন আউট",
  signingOut: "সাইন আউট হচ্ছে…",
  // SCREEN-016 not found / not allowed (COMP-045). notFoundTitle is the D3 copy.
  notFoundTitle: "তথ্যটি পাওয়া যায়নি।",
  notFoundHome: "শুরুর পাতায় ফিরুন",
} as const;

export type MessageKey = keyof typeof bn;

const en = {
  appName: "Fera",
  demoBanner: "Synthetic data · officer verification simulated", // D4 §15.1 demo banner
  metaDescription: "Synthetic-data prototype for missing and found child case coordination",
  demoBannerRegion: "Demo notice",
  languageToggleLabel: "Language",
  skipToContent: "Skip to main content",
  homeLink: "Fera — home",
  plannedLabel: "Planned",
  homePlaceholder: "Parent, staff and officer screens arrive in later tasks.",
  signInTitle: "Sign in",
  signInTitleStaff: "Staff sign-in",
  signInTitleOfficer: "Officer sign-in", // D4 §14
  signInTitleAdmin: "Admin sign-in",
  signInIntro: "For staff, officers and admins. Parents don't need an account.",
  signInReturnNote: "After signing in, you'll go back to that page if your role can open it.",
  usernameLabel: "Username",
  passwordLabel: "Password",
  usernameRequired: "Enter your username.",
  passwordRequired: "Enter your password.",
  showPasswordButton: "Show",
  hidePasswordButton: "Hide",
  showPasswordLabel: "Show password",
  hidePasswordLabel: "Hide password",
  signInAction: "Sign in", // D3 ACT-018
  signingIn: "Signing in…",
  signedInRedirecting: "Signed in. Opening your page…",
  signInErrorCredentials: "Username or password is incorrect", // D3 SCREEN-008 (E-002)
  signInErrorRateLimited: "Please try again in {s} seconds.", // D2B §13 E-007
  signInErrorRateLimitedSoon: "Please try again in a little while.",
  signInErrorGeneric: "Something went wrong. Please try again.", // D2B §13 E-021
  demoAccountsTitle: "Demo accounts",
  mockLabel: "[MOCK]",
  demoAccountsNote: "Synthetic accounts. Tap a name to fill the username. Passwords are not shown here.",
  demoAccountFill: "Fill username:",
  demoFilled: "Username set to {u}",
  demoRoleStaff: "Staff",
  demoRoleOfficer: "Verified officer",
  demoRoleOfficerUnverified: "Unverified officer · staff permissions",
  demoRoleAdmin: "Admin",
  signOutAction: "Sign out",
  signingOut: "Signing out…",
  notFoundTitle: "We couldn't find that.",
  notFoundHome: "Back to home",
} as const satisfies Record<MessageKey, string>;

export const locales = { bn, en } as const;

export type Locale = keyof typeof locales;

// COMP-022 toggle options: each language is named in its own script in both modes
// (D3 §1: "বাংলা | English").
export const languageNames = { bn: "বাংলা", en: "English" } as const satisfies Record<Locale, string>;
