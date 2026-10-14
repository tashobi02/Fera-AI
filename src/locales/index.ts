// Bilingual UI strings. Bangla is the parent default (FR-033); exact copy comes
// from D3/D4 where it exists. TASK-008 adds the language toggle.
const bn = {
  appName: "ফেরা",
  demoBanner: "সিনথেটিক তথ্য · কর্মকর্তা যাচাই সিমুলেশন", // D4 demo banner
  metaDescription: "হারানো ও পাওয়া শিশুর কেস সমন্বয়ের সিনথেটিক-তথ্যের প্রোটোটাইপ",
} as const;

export type MessageKey = keyof typeof bn;

const en = {
  appName: "Fera",
  demoBanner: "Synthetic data · officer verification simulated", // D4 demo banner
  metaDescription: "Synthetic-data prototype for missing and found child case coordination",
} as const satisfies Record<MessageKey, string>;

export const locales = { bn, en } as const;

export type Locale = keyof typeof locales;
