import { FocusHeading } from "@/app/components/focus-heading";
import { HouseIcon, SearchXIcon } from "@/app/components/icons";
import type { NotFoundView } from "@/lib/not-found";
import { locales, type Locale } from "@/locales";

// SCREEN-016 / COMP-045 empty state: icon, one sentence (the heading), one action
// (D4 §12, §14).
// It takes no error ID or record on purpose: E-003 and E-004 render byte-identical
// output, so the page never tells a visitor whether a record or an area exists.
// Neutral tones only (no danger): parents can land here too, and nothing failed.
export function NotFoundScreen({ locale, view }: { locale: Locale; view: NotFoundView }) {
  const t = locales[locale];
  return (
    <div data-surface={view.surface} className="flex flex-1 justify-center px-[16px] py-12 sm:py-20">
      <div className="flex w-full max-w-[30rem] flex-col items-start gap-5">
        <span className="inline-flex size-12 items-center justify-center rounded-md border border-hairline bg-card text-mute">
          <SearchXIcon className="size-6" />
        </span>
        <FocusHeading className="text-heading-3 font-semibold text-ink [&:lang(en)]:font-bold [&:lang(en)]:tracking-[-0.25px]">
          {t.notFoundTitle}
        </FocusHeading>
        {/* A plain link: a full load of the home page, with no client router state. */}
        <a
          href={view.home}
          className={[
            "inline-flex min-h-11 items-center gap-2 rounded-md bg-primary px-5 text-body-md font-medium text-on-primary no-underline",
            "transition-[background-color,transform] duration-(--duration-fast) ease-out hover:bg-primary-pressed active:scale-[0.97]",
          ].join(" ")}
        >
          <HouseIcon />
          <span>{t.notFoundHome}</span>
        </a>
      </div>
    </div>
  );
}
