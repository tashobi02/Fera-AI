// SCREEN-014 duplicate review list (TASK-051; FR-023; SCREEN-014). Owner: Masnun.
//
// A flagged-link list page (D3 SCREEN-014, "list of flagged links"). The list
// query itself is owned by the matching lane (D6 backlog); this file is the
// place where the list will land once that query ships. For now the page is a
// guard: an active verified officer reaches an empty-state copy and a note
// that the matcher-backed list query is pending; every other role gets
// SCREEN-016 through the page guard (BR-010, TC-052). Keeping the path live
// means a future list row that links to /officer/duplicates/[id] lands on a
// real route, and an unverified officer never reaches the detail page.
import type { Metadata } from "next";
import { getLocale } from "@/lib/locale-server";
import { locales } from "@/locales";
import { requireRole } from "@/server/auth/require-role";

export async function generateMetadata(): Promise<Metadata> {
  return { title: locales[await getLocale()].duplicateListPageTitle };
}

export default async function DuplicateListPage() {
  await requireRole(["officer"], "/officer/duplicates");
  const locale = await getLocale();
  const t = locales[locale];
  return (
    <div data-surface="desk" className="mx-auto flex w-full max-w-[64rem] flex-1 flex-col gap-6 px-[16px] py-8 sm:py-12">
      <div className="flex flex-col gap-2">
        <h1 className="text-heading-3 font-semibold text-ink [&:lang(en)]:font-bold [&:lang(en)]:tracking-[-0.25px]">{t.duplicateListHeading}</h1>
        <p className="text-body-sm text-mute">{t.duplicateListIntro}</p>
        <p className="mt-1 flex w-fit items-baseline gap-x-2 rounded-md border border-dashed border-hairline-strong px-3 py-2 text-body-sm text-body">
          <span className="rounded-xs border border-dashed border-hairline-strong px-2 text-caption-md font-medium [&:lang(bn)]:text-body-sm">{t.duplicateMockLabel}</span>
          <span>{t.duplicateDemoBanner}</span>
        </p>
      </div>
      <p className="rounded-md border border-dashed border-hairline-strong px-4 py-6 text-body-sm text-mute">
        {t.duplicateListEmpty}
      </p>
    </div>
  );
}
