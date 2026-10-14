import { setLocale } from "@/app/actions/locale";
import { supportedLocales } from "@/lib/locale";
import { languageNames, locales, type Locale } from "@/locales";

// COMP-022 / ACT-030. A plain form posting to a Server Action: it works before
// hydration and without JavaScript, and each option is a real <button>.
// The selected state is styled from aria-pressed: semibold ink text plus an ink
// bar (>= 3:1 in both themes), and an underline in forced-colors mode.
export function LanguageToggle({ locale }: { locale: Locale }) {
  return (
    <form action={setLocale}>
      <div
        role="group"
        aria-label={locales[locale].languageToggleLabel}
        className="inline-flex max-w-full flex-wrap items-center rounded-md border border-hairline bg-elevated p-[2px]"
      >
        {supportedLocales.map((option, index) => (
          <span key={option} className="inline-flex items-center">
            {index > 0 && (
              <span aria-hidden="true" className="px-[2px] text-body-sm text-faint select-none">
                {" | "}
              </span>
            )}
            <button
              type="submit"
              name="locale"
              value={option}
              lang={option}
              aria-pressed={option === locale}
              className={[
                // Padding in px so 200 % text zoom still fits a 320 px viewport.
                "relative min-h-11 min-w-11 cursor-pointer rounded-sm border border-transparent px-[10px]",
                "text-body-md font-medium text-mute transition-colors duration-(--duration-fast) ease-out",
                "hover:bg-hover hover:text-ink",
                "aria-pressed:border-hairline-strong aria-pressed:bg-segment-active aria-pressed:font-semibold",
                "aria-pressed:text-ink aria-pressed:shadow-1",
                "aria-pressed:after:absolute aria-pressed:after:inset-x-2 aria-pressed:after:bottom-1",
                "aria-pressed:after:h-0.5 aria-pressed:after:rounded-full aria-pressed:after:bg-ink",
                "forced-colors:aria-pressed:border-[Highlight] forced-colors:aria-pressed:underline",
                "forced-colors:aria-pressed:decoration-2 forced-colors:aria-pressed:underline-offset-4",
              ].join(" ")}
            >
              {languageNames[option]}
            </button>
          </span>
        ))}
      </div>
    </form>
  );
}
