// SCREEN-007 found-child log (TASK-026; D3 SCREEN-007, FR-011). Staff home, desk surface.
// Staff and officers (verified or not) may log a found child; everyone else is signed in or
// shown SCREEN-016 by requireRole. The district list is server-read, district level only.
import type { Metadata } from "next";
import districtData from "../../../../data/districts.json";
import { getLocale } from "@/lib/locale-server";
import { locales } from "@/locales";
import { requireRole } from "@/server/auth/require-role";
import { FoundLogForm, type DistrictOption } from "./found-log-form";

const districts: DistrictOption[] = districtData.districts.map(({ code, name_en, name_bn }) => ({ code, name_en, name_bn }));

export async function generateMetadata(): Promise<Metadata> {
  return { title: locales[await getLocale()].foundLogPageTitle };
}

export default async function FoundLogPage() {
  await requireRole(["staff", "officer"], "/staff");
  const locale = await getLocale();
  const t = locales[locale];
  return (
    <div data-surface="desk" className="mx-auto flex w-full max-w-[40rem] flex-1 flex-col gap-6 px-[16px] py-8 sm:py-12">
      <div className="flex flex-col gap-2">
        <h1 className="text-heading-3 font-semibold text-ink [&:lang(en)]:font-bold [&:lang(en)]:tracking-[-0.25px]">
          {t.foundLogTitle}
        </h1>
        <p className="text-body-sm text-mute">{t.foundLogIntro}</p>
        <p className="mt-1 flex w-fit items-baseline gap-x-2 rounded-md border border-dashed border-hairline-strong px-3 py-2 text-body-sm text-body">
          <span className="rounded-xs border border-dashed border-hairline-strong px-2 text-caption-md font-medium">{t.mockLabel}</span>
          <span>{t.foundLogSyntheticNote}</span>
        </p>
      </div>
      <FoundLogForm locale={locale} districts={districts} />
    </div>
  );
}
