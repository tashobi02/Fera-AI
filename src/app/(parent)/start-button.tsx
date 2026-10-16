"use client";

// ACT-001 "শুরু করুন": the notice above it has been shown, so pressing Start is the
// acknowledgement (BR-004). It is recorded in device memory only, then S-002 opens by
// client navigation. Before hydration the link still works; S-002 then shows the
// notice again and asks for its own acknowledgement.
//
// W4: sweep readable expired drafts on every S-001 mount, including a cached
// SPA return. Active attempts, corrupt attempted identities and throwing storage
// retain their data under the shared draft-store rules.
import Link from "next/link";
import { useEffect } from "react";
import { sweepDrafts } from "@/lib/intake/draft-store";
import { INTAKE_PATH, acknowledgeNotice, isPlainClick } from "@/lib/intake/handoff";
import { ArrowRightIcon, PRIMARY_BUTTON } from "./parent-ui";
import { START_DESCRIPTION_ID } from "./provider-notice";

export function StartButton({ label }: { label: string }) {
  useEffect(() => { try { sweepDrafts(); } catch {} }, []);
  return (
    <Link href={INTAKE_PATH} onClick={(event) => {
      if (!event.defaultPrevented && isPlainClick(event)) acknowledgeNotice();
    }} aria-describedby={START_DESCRIPTION_ID} className={`${PRIMARY_BUTTON} w-full`}>
      {label}
      <ArrowRightIcon className="size-5" />
    </Link>
  );
}
