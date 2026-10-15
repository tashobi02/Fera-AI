// SCREEN-008 sign-in (TASK-031; D3 SCREEN-008, §1, §6; D4 §14; FR-037). Public.
//
// Entry: /sign-in, or /sign-in?next=<path> from requireRole (desk entry roots and an
// expired session, E-002). `next` is sanitised here with safeReturnPath and again by the
// form before navigating. Exit: the same URL after an expiry, else the role home, with an
// unverified officer sent to the staff home (BR-024).
//
// The demo hint is decided on the server from DEMO_MODE=1 and lists usernames only.
import type { Metadata } from "next";
import { InfoIcon } from "@/app/components/icons";
import { returnTarget, safeReturnPath, signInAudience, type SignInAudience } from "@/lib/auth-paths";
import { getLocale } from "@/lib/locale-server";
import { locales, type MessageKey } from "@/locales";
import { demoAccounts } from "@/server/auth/demo-accounts";
import { SignInForm } from "./sign-in-form";

const TITLE_KEY: Record<SignInAudience, MessageKey> = {
  staff: "signInTitleStaff",
  officer: "signInTitleOfficer",
  admin: "signInTitleAdmin",
};

export async function generateMetadata(): Promise<Metadata> {
  return { title: locales[await getLocale()].signInTitle };
}

export default async function SignInPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const locale = await getLocale();
  const t = locales[locale];
  const raw = (await searchParams).next;
  const next = safeReturnPath(typeof raw === "string" ? raw : null);
  const audience = signInAudience(next);
  const returning = returnTarget(next) !== null;
  const titleId = "sign-in-title";

  return (
    <div data-surface="desk" className="flex flex-1 justify-center px-[16px] py-10 sm:py-16">
      <div className="flex w-full max-w-[25rem] flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h1 id={titleId} className="text-heading-3 font-semibold text-ink [&:lang(en)]:font-bold [&:lang(en)]:tracking-[-0.25px]">
            {t[audience ? TITLE_KEY[audience] : "signInTitle"]}
          </h1>
          <p className="text-body-sm text-mute">{t.signInIntro}</p>
          {returning && (
            <p className="mt-1 flex items-start gap-2 rounded-md border border-hairline bg-card px-3 py-2.5 text-body-sm text-body">
              <InfoIcon className="mt-[0.2em] size-4 text-info" />
              <span>{t.signInReturnNote}</span>
            </p>
          )}
        </div>
        <SignInForm locale={locale} next={next} titleId={titleId} demo={demoAccounts()} />
      </div>
    </div>
  );
}
