"use client";

// COMP-047 sign-in form (SCREEN-008, ACT-018 → API-020). Error copy and destinations come
// from pure helpers (src/lib/sign-in-errors.ts, src/lib/auth-paths.ts).
//
// - method="post" and noValidate: without JavaScript the password never lands in a URL,
//   and required-field messages are ours (bilingual), not the browser's.
// - The submit button uses aria-disabled while busy, never `disabled`, so keyboard focus
//   stays on it and a second press is ignored instead of dropping focus to <body>.
// - The status region is always mounted and emptied on every attempt, so a repeated
//   identical error is announced again.
import { useId, useRef, useState, type FormEvent } from "react";
import {
  CircleAlertIcon,
  ClockIcon,
  CornerDownLeftIcon,
  EyeIcon,
  EyeOffIcon,
  LoaderCircleIcon,
  LogInIcon,
} from "@/app/components/icons";
import { destinationAfterSignIn, parseSignedInSession } from "@/lib/auth-paths";
import { classifySignInFailure, signInFailureText, type SignInFailure } from "@/lib/sign-in-errors";
import { locales, type Locale, type MessageKey } from "@/locales";
import type { DemoAccount, DemoAccountRole } from "@/server/auth/demo-accounts";

const SIGN_IN_API = "/api/auth/sign-in";

const DEMO_ROLE_KEY: Record<DemoAccountRole, MessageKey> = {
  staff: "demoRoleStaff",
  officer: "demoRoleOfficer",
  "officer-unverified": "demoRoleOfficerUnverified",
  admin: "demoRoleAdmin",
};

type Status = "idle" | "submitting" | "redirecting";
type FieldErrors = { username?: boolean; password?: boolean };

const inputClass = [
  "min-h-11 w-full min-w-0 rounded-md border border-hairline bg-elevated px-3 text-body-md text-ink",
  "transition-colors duration-(--duration-fast) ease-out",
  "hover:border-hairline-strong focus:border-hairline-strong focus:shadow-1",
  "aria-invalid:border-danger",
].join(" ");

const ids = (...parts: (string | false | undefined)[]) => parts.filter(Boolean).join(" ") || undefined;

export function SignInForm({
  locale,
  next,
  titleId,
  demo,
}: {
  locale: Locale;
  next: string | null;
  titleId: string;
  demo: readonly DemoAccount[] | null;
}) {
  const t = locales[locale];
  const uid = useId();
  const id = {
    username: `${uid}-username`,
    password: `${uid}-password`,
    usernameError: `${uid}-username-error`,
    passwordError: `${uid}-password-error`,
    status: `${uid}-status`,
    demoTitle: `${uid}-demo-title`,
  };

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [failure, setFailure] = useState<SignInFailure | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const inFlight = useRef(false);
  const usernameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const busy = status !== "idle";
  const credentialsWrong = failure?.kind === "credentials";

  function fail(outcome: SignInFailure) {
    setFailure(outcome);
    setStatus("idle");
    inFlight.current = false;
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;

    const errors: FieldErrors = { username: username.trim() === "", password: password === "" };
    setFieldErrors(errors);
    setFailure(null);
    if (errors.username || errors.password) {
      (errors.username ? usernameRef : passwordRef).current?.focus();
      return;
    }

    inFlight.current = true;
    setShowPassword(false);
    setStatus("submitting");

    let res: Response;
    try {
      res = await fetch(SIGN_IN_API, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ username, password }),
        credentials: "same-origin",
        cache: "no-store",
      });
    } catch {
      return fail({ kind: "generic" }); // offline or the request never completed
    }

    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }

    if (res.ok) {
      const session = parseSignedInSession(body);
      if (!session) return fail({ kind: "generic" });
      setStatus("redirecting");
      // A full navigation, so every server component re-reads the new session cookie.
      window.location.assign(destinationAfterSignIn(session, next));
      return;
    }

    setPassword("");
    fail(classifySignInFailure({ status: res.status, body, retryAfter: res.headers.get("retry-after") }));
  }

  function fillUsername(value: string) {
    setUsername(value);
    setFieldErrors((e) => ({ ...e, username: false }));
    passwordRef.current?.focus();
  }

  const failureText = failure ? signInFailureText(failure, locale) : null;
  const FailureIcon = failure?.kind === "rate-limited" ? ClockIcon : CircleAlertIcon;

  return (
    <div className="flex flex-col gap-4">
      <form
        method="post"
        noValidate
        aria-labelledby={titleId}
        onSubmit={onSubmit}
        className="flex flex-col rounded-lg border border-hairline bg-surface p-5 shadow-1 sm:p-6"
      >
        {/* Always mounted and never display:none, so screen readers watch it; it has no
            height until a failed attempt fills it. */}
        <div id={id.status} role="alert" aria-atomic="true">
          {failureText && (
            <p
              className={[
                "mb-5 flex items-start gap-2 rounded-md px-3 py-2.5 text-body-sm",
                failure?.kind === "rate-limited" ? "bg-warning-soft text-warning-text" : "bg-danger-soft text-danger-text",
              ].join(" ")}
            >
              <FailureIcon className="mt-[0.2em] size-4" />
              <span>{failureText}</span>
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={id.username} className="text-body-sm font-medium text-ink">
            {t.usernameLabel}
          </label>
          <input
            ref={usernameRef}
            id={id.username}
            name="username"
            type="text"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            maxLength={64}
            aria-required="true"
            aria-invalid={fieldErrors.username || credentialsWrong || undefined}
            aria-describedby={ids(fieldErrors.username && id.usernameError, credentialsWrong && id.status)}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className={inputClass}
          />
          {fieldErrors.username && (
            <p id={id.usernameError} className="flex items-start gap-1.5 text-caption-md text-danger-text">
              <CircleAlertIcon className="mt-[0.15em] size-3.5" />
              <span>{t.usernameRequired}</span>
            </p>
          )}
        </div>

        <div className="mt-5 flex flex-col gap-1.5">
          <label htmlFor={id.password} className="text-body-sm font-medium text-ink">
            {t.passwordLabel}
          </label>
          <div className="flex gap-2">
            <input
              ref={passwordRef}
              id={id.password}
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              maxLength={200}
              aria-required="true"
              aria-invalid={fieldErrors.password || credentialsWrong || undefined}
              aria-describedby={ids(fieldErrors.password && id.passwordError, credentialsWrong && id.status)}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`${inputClass} flex-1`}
            />
            <button
              type="button"
              aria-controls={id.password}
              aria-label={showPassword ? t.hidePasswordLabel : t.showPasswordLabel}
              onClick={() => setShowPassword((v) => !v)}
              className={[
                "inline-flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-md",
                "border border-hairline bg-elevated px-3 text-body-sm font-medium text-mute",
                "transition-colors duration-(--duration-fast) ease-out hover:border-hairline-strong hover:text-ink",
              ].join(" ")}
            >
              {showPassword ? <EyeOffIcon /> : <EyeIcon />}
              <span>{showPassword ? t.hidePasswordButton : t.showPasswordButton}</span>
            </button>
          </div>
          {fieldErrors.password && (
            <p id={id.passwordError} className="flex items-start gap-1.5 text-caption-md text-danger-text">
              <CircleAlertIcon className="mt-[0.15em] size-3.5" />
              <span>{t.passwordRequired}</span>
            </p>
          )}
        </div>

        <button
          type="submit"
          aria-disabled={busy || undefined}
          className={[
            "mt-6 inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-md bg-primary px-5",
            "text-body-md font-medium text-on-primary",
            "transition-[opacity,transform,background-color] duration-(--duration-fast) ease-out",
            "hover:opacity-92 active:scale-[0.97] active:bg-primary-pressed",
            "aria-disabled:cursor-progress aria-disabled:opacity-80 aria-disabled:active:scale-100",
          ].join(" ")}
        >
          {busy ? <LoaderCircleIcon className="size-4 animate-spin" /> : <LogInIcon />}
          <span>{busy ? t.signingIn : t.signInAction}</span>
        </button>
        <p aria-live="polite" className="sr-only">
          {status === "submitting" ? t.signingIn : status === "redirecting" ? t.signedInRedirecting : ""}
        </p>
      </form>

      {demo && demo.length > 0 && (
        <section aria-labelledby={id.demoTitle} className="rounded-lg border border-dashed border-hairline-strong p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id={id.demoTitle} className="text-body-sm font-medium text-ink">
              {t.demoAccountsTitle}
            </h2>
            <span className="rounded-xs border border-dashed border-hairline-strong px-1.5 text-caption-sm font-medium text-mute">
              {t.mockLabel}
            </span>
          </div>
          <p className="mt-1 text-caption-md text-mute">{t.demoAccountsNote}</p>
          <ul className="mt-2 flex flex-col">
            {demo.map((account) => (
              <li key={account.username} className="border-t border-hairline-soft first:border-t-0">
                <button
                  type="button"
                  aria-controls={id.username}
                  onClick={() => fillUsername(account.username)}
                  className={[
                    "flex min-h-11 w-full cursor-pointer flex-wrap items-center justify-between gap-x-3 gap-y-0.5",
                    "group rounded-sm px-2 py-1.5 text-start transition-colors duration-(--duration-fast) ease-out",
                    "hover:bg-hover focus-visible:bg-hover",
                  ].join(" ")}
                >
                  <span className="sr-only">{t.demoAccountFill} </span>
                  <span lang="en" translate="no" className="font-mono text-body-sm text-ink">
                    {account.username}
                  </span>
                  <span className="inline-flex items-center gap-2 text-caption-md text-mute">
                    {t[DEMO_ROLE_KEY[account.role]]}
                    <CornerDownLeftIcon className="size-3.5 text-faint group-hover:text-ink group-focus-visible:text-ink" />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
