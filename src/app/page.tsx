import { getLocale } from "@/lib/locale-server";
import { locales } from "@/locales";

// Placeholder home inside the shell. SCREEN-001 and the other screens belong to
// their own tasks and owners.
export default async function Home() {
  const t = locales[await getLocale()];
  return (
    <div data-surface="parent" className="mx-auto flex w-full max-w-[30rem] flex-col gap-4 px-4 py-8">
      <h1 className="text-heading-2 font-semibold text-ink">{t.appName}</h1>
      <p>{t.metaDescription}</p>
      <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-lg border border-dashed border-hairline-strong bg-surface px-4 py-3 text-body-md text-mute">
        <span className="rounded-xs border border-dashed border-hairline-strong px-2 text-caption-md font-medium text-body">
          {t.plannedLabel}
        </span>
        <span>{t.homePlaceholder}</span>
      </p>
    </div>
  );
}
