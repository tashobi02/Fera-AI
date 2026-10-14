import Link from "next/link";
import { LanguageToggle } from "@/app/components/language-toggle";
import { locales, type Locale } from "@/locales";

// COMP-022 header plus the D4 §15.1 demo banner. The banner is a persistent,
// static label (no live region) with the dashed "not real yet" edge.
export function AppHeader({ locale }: { locale: Locale }) {
  const t = locales[locale];
  return (
    <header className="bg-surface">
      <div className="flex min-h-14 flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-hairline px-4 py-1.5">
        <Link
          href="/"
          aria-label={t.homeLink}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-sm text-title font-semibold text-ink no-underline"
        >
          {t.appName}
          <span aria-hidden="true" className="size-1.5 rounded-full bg-primary" />
        </Link>
        <LanguageToggle locale={locale} />
      </div>
      <p className="flex items-start gap-2 border-b border-dashed border-hairline-strong bg-canvas px-4 py-2 text-body-sm text-mute">
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="mt-[0.2em] size-4 shrink-0"
        >
          {/* Lucide "info" v1.57.0: third_party/lucide.LICENSE */}
          <circle cx="12" cy="12" r="10" />
          <path d="M12 16v-4" />
          <path d="M12 8h.01" />
        </svg>
        <span>{t.demoBanner}</span>
      </p>
    </header>
  );
}
