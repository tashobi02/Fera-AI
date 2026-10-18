"use client";

// ACT-029 sign-out (D3 §6: clears the cookie → SCREEN-008). For the desk shells (S-007,
// S-009, S-013) to place in their nav; not mounted by TASK-031. Calls API-020 sign-out,
// then loads /sign-in. On failure it stays put and announces the generic error.
import { useRef, useState } from "react";
import { LoaderCircleIcon, LogOutIcon } from "@/app/components/icons";
import { SIGN_IN_PATH } from "@/lib/auth-paths";
import { locales, type Locale } from "@/locales";

export function SignOutButton({ locale }: { locale: Locale }) {
  const t = locales[locale];
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const inFlight = useRef(false);

  async function signOut() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setFailed(false);
    try {
      const res = await fetch("/api/auth/sign-out", { method: "POST", credentials: "same-origin", cache: "no-store" });
      if (res.ok) {
        window.location.assign(SIGN_IN_PATH);
        return;
      }
    } catch {
      // offline: fall through to the error state
    }
    inFlight.current = false;
    setBusy(false);
    setFailed(true);
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={signOut}
        aria-disabled={busy || undefined}
        className={[
          "inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-md px-3 text-body-sm font-medium text-body",
          "transition-colors duration-(--duration-fast) ease-out hover:bg-hover hover:text-ink aria-disabled:cursor-progress",
        ].join(" ")}
      >
        {busy ? <LoaderCircleIcon className="size-4 animate-spin" /> : <LogOutIcon />}
        <span>{busy ? t.signingOut : t.signOutAction}</span>
      </button>
      <span role="alert" className="text-caption-md text-mute">
        {failed ? t.signInErrorGeneric : ""}
      </span>
    </span>
  );
}
