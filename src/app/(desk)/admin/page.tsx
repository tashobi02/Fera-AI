// SCREEN-013 admin data tools (TASK-032, COMP-043; D3 SCREEN-013, D4 §14/§15 Admin row).
// Admin only: requireRole sends a signed-out visitor to sign-in and any other role to
// SCREEN-016 with an access.denied audit row.
//
// The page shows metadata only: an eligible-report count (API-016 eligibility, counted on
// the redactor pool), the API-021 AdminUserView rows, and the synthetic-import form
// (API-015, SCREEN-013 ACT-026; TASK-048, FR-024, TC-014). No child, candidate or
// contact field is read here. Each data source fails on its own: its panel shows an
// "unavailable" message and one page.data_unavailable log line (error class/code only).
import type { Metadata } from "next";
import { createLogger, describeError } from "@/app/api/_shared/log";
import { getLocale } from "@/lib/locale-server";
import { locales } from "@/locales";
import { requireRole } from "@/server/auth/require-role";
import {
  countEligibleCases,
  getRedactorPool,
  listAdminUsers,
} from "@/server/admin";
import { ImportForm } from "./import-form";
import { RedactionForm } from "./redaction-form";
import { VerifyOfficersForm } from "./verify-officers-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: locales[await getLocale()].adminTitle };
}

const logger = createLogger();

async function settle<T>(work: () => Promise<T>): Promise<T | null> {
  try {
    return await work();
  } catch (err) {
    logger.error({
      event: "page.data_unavailable",
      error_id: "E-021",
      ...describeError(err),
    });
    return null;
  }
}

// The dashed "not real yet" chip (DESIGN.md Fera overrides: honest labels).
function HonestChip({
  children,
  latin = false,
}: {
  children: string;
  latin?: boolean;
}) {
  return (
    <span
      lang={latin ? "en" : undefined}
      translate={latin ? "no" : undefined}
      className="inline-flex min-h-6 items-center rounded-xs border border-dashed border-hairline-strong px-2 text-caption-md font-medium text-body [&:lang(bn)]:text-body-sm"
    >
      {children}
    </span>
  );
}

export default async function AdminPage() {
  const { principal } = await requireRole(["admin"], "/admin");
  const locale = await getLocale();
  const t = locales[locale];
  const [eligible, users] = await Promise.all([
    settle(() => countEligibleCases(getRedactorPool(), principal)),
    settle(() => listAdminUsers(principal)),
  ]);

  return (
    <div
      data-surface="desk"
      className="flex flex-1 justify-center px-[16px] py-8 sm:px-6 sm:py-12"
    >
      <div className="flex w-full max-w-[52rem] flex-col gap-8">
        <header className="flex flex-col gap-3">
          <h1 className="text-heading-3 font-semibold text-ink [&:lang(en)]:font-bold [&:lang(en)]:tracking-[-0.25px]">
            {t.adminTitle}
          </h1>
          <p className="max-w-[65ch] text-body-sm text-mute">{t.adminIntro}</p>
          <p className="flex flex-wrap gap-2">
            <HonestChip>{t.syntheticLabel}</HonestChip>
            <HonestChip latin>{t.mockLabel}</HonestChip>
          </p>
        </header>

        <RedactionForm locale={locale} eligible={eligible} />
        {/* Re-keyed so a refresh that now has the list (after a failed first load) remounts it. */}
        <VerifyOfficersForm
          key={users === null ? "unavailable" : "loaded"}
          locale={locale}
          initial={users}
        />

        <ImportForm locale={locale} />
      </div>
    </div>
  );
}
