// SCREEN-001 Welcome and language (TASK-021; D3 SCREEN-001, §4; D4 §10, §14, §15.1).
// Public and static: two lines on what Fera does and does not do, the provider notice
// (COMP-050), Start (ACT-001) and the 13219 call link. Nothing is sent from here.
import { getLocale } from "@/lib/locale-server";
import { locales } from "@/locales";
import { PhoneIcon } from "./parent-ui";
import { ProviderNotice } from "./provider-notice";
import { StartButton } from "./start-button";

export default async function WelcomePage() {
  const locale = await getLocale();
  const t = locales[locale];
  return (
    <div data-surface="parent" className="mx-auto flex w-full max-w-[30rem] flex-col gap-6 px-[16px] pt-8 pb-12">
      <div className="flex flex-col gap-2">
        <h1 className="text-heading-3 font-semibold text-ink [&:lang(en)]:font-bold [&:lang(en)]:tracking-[-0.25px]">
          {t.welcomeLead}
        </h1>
        <p className="text-body-lg text-body">{t.welcomeNoAlerts}</p>
      </div>
      <ProviderNotice locale={locale} variant="full" />
      <StartButton label={t.startAction} />
      <a href="tel:13219" className="inline-flex min-h-11 items-center gap-2 self-start rounded-md text-body-lg font-medium">
        <PhoneIcon />
        {t.callHelpline}
      </a>
    </div>
  );
}
