// COMP-050 consent / provider-processing notice (D3 SCREEN-001, D4 §15.1; BR-004,
// FR-007). `full` on SCREEN-001 and on SCREEN-002 before acknowledgement; `compact`
// stays at the top of SCREEN-002 so the notice is visible while the parent records or
// types (D4 §15 parent-intake regions: processing notice, then synthetic badge).
import { InfoIcon } from "@/app/components/icons";
import { locales, type Locale } from "@/locales";
import { HonestLabel } from "./parent-ui";

export const NOTICE_BODY_ID = "provider-notice-body";
export const START_DESCRIPTION_ID = "provider-review-first";

export function ProviderNotice({
  locale,
  variant,
  mock = false,
  cached = false,
}: {
  locale: Locale;
  variant: "full" | "compact";
  mock?: boolean;
  cached?: boolean;
}) {
  const t = locales[locale];
  const labels = (
    <div className="flex flex-wrap items-center gap-2">
      <HonestLabel>{t.syntheticBadge}</HonestLabel>
      {mock && (
        <>
          <HonestLabel lang="en">{t.mockLabel}</HonestLabel>
          <span className="text-body-sm text-mute">{t.mockReplies}</span>
        </>
      )}
      {cached && <HonestLabel>{t.cachedBadge}</HonestLabel>}
    </div>
  );

  if (variant === "compact") {
    return (
      <section aria-label={t.noticeTitle} className="flex flex-col gap-2 rounded-md border border-hairline bg-card px-3 py-2.5">
        <p className="flex items-start gap-2 text-body-md text-body">
          <InfoIcon className="mt-[0.3em] size-4 text-info" />
          <span>{t.providerNotice}</span>
        </p>
        {labels}
      </section>
    );
  }

  return (
    <section aria-labelledby="provider-notice-title" className="flex flex-col gap-3 rounded-lg border border-hairline bg-surface p-[16px] shadow-1 sm:p-5">
      <h2 id="provider-notice-title" className="flex items-start gap-2 text-heading-sm font-semibold text-ink">
        <InfoIcon className="mt-[0.3em] size-5 text-info" />
        <span>{t.noticeTitle}</span>
      </h2>
      <ul id={NOTICE_BODY_ID} className="flex list-disc flex-col gap-2 ps-5 text-body-lg text-body marker:text-faint">
        <li>{t.providerNotice}</li>
        <li id={START_DESCRIPTION_ID}>{t.noticeReviewFirst}</li>
        <li>{t.noticeWhoSees}</li>
      </ul>
      {labels}
    </section>
  );
}
