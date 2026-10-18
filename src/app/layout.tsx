import type { Metadata } from "next";
import localFont from "next/font/local";
import type { ReactNode } from "react";
import { AppHeader } from "@/app/components/app-header";
import { getLocale } from "@/lib/locale-server";
import { locales } from "@/locales";
import "./globals.css";

// Self-hosted woff2 subsets (no runtime font CDN: the finale may run offline).
// Sources and OFL licences: src/app/fonts/*-OFL.txt and THIRD_PARTY_NOTICES.md.
const inter = localFont({
  src: "./fonts/inter-latin-wght.woff2",
  weight: "100 900",
  display: "swap",
  variable: "--font-inter",
});

const notoBengali = localFont({
  src: "./fonts/noto-sans-bengali-bengali-wght.woff2",
  weight: "100 900",
  display: "swap",
  variable: "--font-noto-bengali",
  adjustFontFallback: false,
  declarations: [
    {
      prop: "unicode-range",
      value:
        "U+0951-0952, U+0964-0965, U+0980-09FE, U+1CD0, U+1CD2, U+1CD5-1CD6, U+1CD8, U+1CE1, U+1CEA, U+1CED, U+1CF2, U+1CF5-1CF7, U+200C-200D, U+20B9, U+25CC, U+A8F1",
    },
  ],
});

const jetbrainsMono = localFont({
  src: "./fonts/jetbrains-mono-latin-wght.woff2",
  weight: "100 800",
  display: "swap",
  variable: "--font-jetbrains-mono",
  preload: false,
  adjustFontFallback: false,
});

export async function generateMetadata(): Promise<Metadata> {
  const t = locales[await getLocale()];
  return {
    title: { default: t.appName, template: `%s · ${t.appName}` },
    description: t.metaDescription,
    // Synthetic prototype: keep it out of search so it is never mistaken for a live service.
    robots: { index: false, follow: false },
  };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  const t = locales[locale];
  return (
    <html lang={locale} className={`${inter.variable} ${notoBengali.variable} ${jetbrainsMono.variable}`}>
      <body>
        {/* In flow when focused, so it pushes the header down instead of covering it. */}
        <a href="#main" className="sr-only self-start focus:not-sr-only focus:m-2">
          <span className="inline-flex min-h-11 items-center rounded-md border border-hairline-strong bg-surface px-4 py-2 text-body-md text-ink shadow-1">
            {t.skipToContent}
          </span>
        </a>
        <AppHeader locale={locale} />
        {/* The shell owns <main>; screens render inside it and set data-surface. */}
        <main id="main" tabIndex={-1} className="flex flex-1 flex-col outline-none">
          {children}
        </main>
      </body>
    </html>
  );
}
