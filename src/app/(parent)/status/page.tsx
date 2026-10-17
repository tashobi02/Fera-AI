// SCREEN-006 parent case status and edit (TASK-049/050, P3-102/103/104; D3 §3 row
// 135–148; D4 §10/§14/§15.1; FR-030, BR-007/010/024/025; TC-019, TC-022).
//
// - Server-rendered: the page reads API-018 on the server through listMyCases and
//   projects each row through projectCaseFor; nothing in the child payload
//   reaches the client beyond the per-row allowlist. No client-side fetch
//   happens on first paint.
// - Own details via API-004 only: the list view (id, ref_code, kind, status,
//   status_group, updated_at, editable) is the index; tapping "View report" goes
//   to /report/<id> which is the existing S-004 page and uses API-004 for the
//   full owner view. Tapping "Correct details" writes a device-local edit-mode
//   pointer and goes to /intake/review (S-003); the review screen pulls the
//   canonical owner view through API-004 and pre-fills the draft.
// - Edit only while editable: the editable flag comes from EDITABLE_STATUSES +
//   the redaction check, exactly the same rule the per-case read uses. Terminal
//   and redacted cases render the locked copy and a disabled button (D3 row 144
//   E-018/E-019).
// - No candidates, no found rows, no other parent's data; the service-level
//   projectCaseFor refuses to project a row that does not belong to this session
//   and the page only ever renders the projected list.
// - Status mapping per the user-delegated 18 Oct decision: submitted/open →
//   "Open" (status_group: "open"), pending/confirmed → "Being checked"
//   (status_group: "matched"), closed → "Closed" (status_group: "closed"). The
//   referred follow uses the canonical "open" group (StatusGroup enum shared
//   with S-004). No closure reason in our copy.
// - DESIGN/impeccable: 44 px targets, paper surface, no red, Bangla default with
//   English toggle, 18 px / 1.7 reading text, status uses icon + text + colour
//   (D4 §13). The page is a server component; only the "Correct details"
//   button is a small client island.
import type { Metadata } from "next";
import { getLocale } from "@/lib/locale-server";
import type { MyCaseResponse } from "@/contracts";
import { requireRole } from "@/server/auth/require-role";
import { listMyCases } from "@/server/parent/my-reports";
import { getPool } from "@/server/db/pool";
import { locales } from "@/locales";
import { StatusCard } from "./status-card";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: locales[await getLocale()].statusTitle };
}

export default async function StatusPage() {
  const locale = await getLocale();
  const t = locales[locale];
  // Parent-only: a missing parent cookie is the SCREEN-016 notFound; a desk
  // principal is the same 404 after a page-denial audit.
  const { principal } = await requireRole(["parent"], "/status");
  // API-018 list: parent session → per-case summary; no candidates, no found rows.
  const list: MyCaseResponse = await listMyCases(principal, getPool());

  return (
    <div
      data-surface="parent"
      className="mx-auto flex w-full max-w-[36rem] flex-col gap-6 px-4 py-8"
    >
      <header className="flex flex-col gap-3">
        <h1 className="text-heading-2 font-semibold text-ink">{t.statusTitle}</h1>
      </header>

      {list.reports.length === 0 ? (
        <div
          role="status"
          aria-live="polite"
          className="flex flex-col gap-4 rounded-lg border border-hairline bg-surface p-[16px] sm:p-5"
        >
          <p className="text-body-lg leading-[1.7] text-ink">{t.statusNoReports}</p>
          <a
            href="/intake"
            className="inline-flex min-h-12 max-w-full items-center justify-center gap-2 self-start rounded-md bg-primary px-5 text-body-lg font-medium text-on-primary no-underline hover:bg-primary-pressed"
          >
            {t.statusEmptyAction}
          </a>
        </div>
      ) : (
        <ul
          aria-label={t.statusListLabel}
          className="flex flex-col gap-4"
        >
          {list.reports.map((entry) => (
            <li key={entry.id} className="flex">
              <StatusCard entry={entry} locale={locale} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}