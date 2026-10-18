"use client";

// SCREEN-006 edit lane entry (TASK-049, P3-102; D3 §3 row 142 ACT-017). The status
// page is server-rendered; only the "তথ্য সংশোধন" / "Correct details" button needs a
// client handler so it can record the edit-mode device-local pointer and navigate
// to S-003. The button is disabled for terminal cases (editable: false); the
// disabled copy mirrors D3 row 144 "E-018, E-019" in the parent status copy set.
//
// No child payload is ever in the URL: the device-local record is the seam, and
// the review screen pulls the canonical owner view through API-004 (BR-007).
import { useRouter } from "next/navigation";
import { useState } from "react";
import { beginEditMode } from "@/lib/intake/edit-handoff";
import { REVIEW_PATH } from "@/lib/intake/handoff";
import { locales, type Locale, type MessageKey } from "@/locales";

export function EditDetailsButton({
  locale,
  caseId,
  refCode,
  editable,
}: {
  locale: Locale;
  caseId: string;
  refCode: string;
  editable: boolean;
}) {
  const router = useRouter();
  const t = locales[locale];
  const [storageFailed, setStorageFailed] = useState(false);
  const actionKey: MessageKey = editable ? "statusEditAction" : "statusEditBlocked";
  const className = editable
    ? "inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-md bg-primary px-5 text-body-lg font-medium text-on-primary no-underline transition-[background-color,transform] duration-(--duration-fast) ease-out hover:bg-primary-pressed active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2"
    : "inline-flex min-h-12 cursor-not-allowed items-center justify-center gap-2 rounded-md border border-dashed border-hairline-strong bg-card px-5 text-body-lg font-medium text-mute";
  return (
    <>
      <button
        type="button"
        className={className}
        onClick={() => {
          if (!editable) return;
          const ok = beginEditMode({ caseId, refCode });
          if (!ok) { setStorageFailed(true); return; }
          router.push(REVIEW_PATH);
        }}
        aria-disabled={!editable || undefined}
      >
        {t[actionKey]}
      </button>
      {storageFailed && (
        <p role="alert" className="flex items-start gap-2 text-body-lg text-body">
          {t.statusEditFailed}
        </p>
      )}
    </>
  );
}