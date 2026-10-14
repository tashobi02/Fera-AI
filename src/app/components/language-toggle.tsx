import { setLocale } from "@/app/actions/locale";
import { languageNames, locales, type Locale } from "@/locales";

const options: readonly Locale[] = ["bn", "en"];

// COMP-022 / ACT-030. A plain form posting to a Server Action: it works before
// hydration and without JavaScript, and each option is a real <button>.
export function LanguageToggle({ locale }: { locale: Locale }) {
  return (
    <form action={setLocale}>
      <div
        role="group"
        aria-label={locales[locale].languageToggleLabel}
        className="inline-flex max-w-full flex-wrap items-center rounded-md border border-hairline bg-elevated p-[2px]"
      >
        {options.map((option, index) => {
          const active = option === locale;
          return (
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
                aria-pressed={active}
                className={[
                  // Padding in px so 200 % text zoom still fits a 320 px viewport.
                  "min-h-11 min-w-11 cursor-pointer rounded-sm border px-[10px] text-body-md font-medium",
                  "transition-colors duration-(--duration-fast) ease-out",
                  active
                    ? "border-hairline-strong bg-segment-active text-ink shadow-1"
                    : "border-transparent text-mute hover:bg-hover hover:text-ink",
                ].join(" ")}
              >
                {languageNames[option]}
              </button>
            </span>
          );
        })}
      </div>
    </form>
  );
}
