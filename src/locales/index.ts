// Bilingual UI strings. Bangla is the parent default (FR-033); exact copy comes
// from D3/D4 where it exists. Bangla strings use Bangla numerals.
const bn = {
  appName: "ফেরা",
  demoBanner: "সিনথেটিক তথ্য · কর্মকর্তা যাচাই সিমুলেশন", // D4 §15.1 demo banner
  metaDescription: "হারানো ও পাওয়া শিশুর কেস সমন্বয়ের সিনথেটিক-তথ্যের প্রোটোটাইপ",
  languageToggleLabel: "ভাষা",
  skipToContent: "মূল অংশে যান",
  homeLink: "ফেরা — শুরুর পাতা",
  plannedLabel: "পরিকল্পিত",
  homePlaceholder: "অভিভাবক, কর্মী ও কর্মকর্তার স্ক্রিন পরের কাজগুলোতে যুক্ত হবে।",
} as const;

export type MessageKey = keyof typeof bn;

const en = {
  appName: "Fera",
  demoBanner: "Synthetic data · officer verification simulated", // D4 §15.1 demo banner
  metaDescription: "Synthetic-data prototype for missing and found child case coordination",
  languageToggleLabel: "Language",
  skipToContent: "Skip to main content",
  homeLink: "Fera — home",
  plannedLabel: "Planned",
  homePlaceholder: "Parent, staff and officer screens arrive in later tasks.",
} as const satisfies Record<MessageKey, string>;

export const locales = { bn, en } as const;

export type Locale = keyof typeof locales;

// COMP-022 toggle options: each language is named in its own script in both modes
// (D3 §1: "বাংলা | English").
export const languageNames = { bn: "বাংলা", en: "English" } as const satisfies Record<Locale, string>;
