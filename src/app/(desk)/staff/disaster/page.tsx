// SCREEN-015 disaster mode (TASK-052; D3 SCREEN-015, FR-036, TC-035). Staff-only page
// that reuses the S-007 found-log form so a saved child becomes a found case through
// API-007 exactly like the normal log. The disaster-specific features are planned, not
// live: the banner "পরিকল্পিত সম্প্রসারণ" / "Planned expansion" is always shown, and
// the intro makes the prototype state explicit (synthetic data, same save path).
//
// Honest copy rules followed here:
// - Status is icon + text, never colour alone (DESIGN.md Fera overrides; D4 §7).
// - No alert/rescue/return wording, no red. The banner uses a dashed border so the
//   "not real yet" state stays obvious (DESIGN.md principle 6).
// - Bangla + English in the same area file; new Bangla strings are marked for review.
import type { Metadata } from "next";
import districtData from "../../../../../data/districts.json";
import { getLocale } from "@/lib/locale-server";
import { locales } from "@/locales";
import { requireRole } from "@/server/auth/require-role";
import { CircleDashedIcon } from "@/app/components/icons";
import { FoundLogForm, type DistrictOption } from "../found-log-form";

const all: DistrictOption[] = districtData.districts.map(({ code, name_en, name_bn }) => ({ code, name_en, name_bn }));
// Sorted once here, per locale, so server and client render the same option order.
const sortFor = (locale: "bn" | "en"): DistrictOption[] =>
  [...all].sort((a, b) =>
    locale === "bn" ? a.name_bn.localeCompare(b.name_bn, "bn") : a.name_en.localeCompare(b.name_en, "en"),
  );

export async function generateMetadata(): Promise<Metadata> {
  return { title: locales[await getLocale()].staffDisasterPageTitle };
}

export default async function DisasterPage() {
  await requireRole(["staff", "officer"], "/staff/disaster");
  const locale = await getLocale();
  const t = locales[locale];
  return (
    <div data-surface="desk" className="mx-auto flex w-full max-w-[40rem] flex-1 flex-col gap-6 px-[16px] py-8 sm:py-12">
      <div className="flex flex-col gap-2">
        <h1 className="text-heading-3 font-semibold text-ink [&:lang(en)]:font-bold [&:lang(en)]:tracking-[-0.25px]">
          {t.staffDisasterTitle}
        </h1>
        <p
          role="status"
          aria-label={t.staffDisasterPlannedLabel}
          className="flex w-fit items-center gap-x-2 rounded-md border border-dashed border-hairline-strong px-3 py-2 text-body-sm text-body"
        >
          <CircleDashedIcon className="size-4 shrink-0 text-mute" aria-hidden="true" />
          <span className="font-medium">{t.staffDisasterPlannedLabel}</span>
          <span className="text-mute">·</span>
          <span>{t.staffDisasterPlannedSubtitle}</span>
        </p>
        <p className="text-body-sm text-body">{t.staffDisasterIntro}</p>
        <p className="mt-1 flex w-fit items-baseline gap-x-2 rounded-md border border-dashed border-hairline-strong px-3 py-2 text-body-sm text-body">
          <span className="rounded-xs border border-dashed border-hairline-strong px-2 text-caption-md font-medium [&:lang(bn)]:text-body-sm">{t.mockLabel}</span>
          <span>{t.staffDisasterSyntheticNote}</span>
        </p>
      </div>
      <FoundLogForm locale={locale} districts={sortFor(locale)} />
    </div>
  );
}