"use client";

// COMP-047 sign-in form (SCREEN-008, ACT-018 → API-020). The state machine, the API call
// and the copy are pure helpers (src/lib/sign-in-flow.ts, sign-in-errors.ts, auth-paths.ts);
// this file wires them to the DOM.
//
// - Values are read from FormData at submit, so browser and password-manager autofill
//   count even when no input event fired. The inputs are uncontrolled.
// - method="post" and noValidate: without JavaScript the password never lands in a URL,
//   and required-field messages are ours (bilingual), not the browser's.
// - The submit button uses aria-disabled while busy, never `disabled`, so keyboard focus
//   stays on it; a synchronous guard ignores a second press.
// - API-020 is abandoned after 15 s (generic error). Success uses location.replace, so
//   Back does not return to the sign-in form; a bfcache restore (pageshow.persisted)
//   resets the busy state.
// - The alert region is always mounted and emptied on every attempt, so a repeated
//   identical error is announced again.
import { useEffect, useId, useReducer, useRef, useState, type FormEvent, type RefObject } from "react";
import {
  CircleAlertIcon,
  ClockIcon,
  CornerDownLeftIcon,
  EyeIcon,
  EyeOffIcon,
  LoaderCircleIcon,
  LogInIcon,
} from "@/app/components/icons";
import type { DemoAccount, DemoAccountRole } from "@/lib/demo-accounts";
import { signInFailureText } from "@/lib/sign-in-errors";
import {
  clearsPassword,
  createInFlightGuard,
  focusAfter,
  initialSignInState,
  requestSignIn,
  signInReducer,
  valuesFromFormData,
  type SignInField,
} from "@/lib/sign-in-flow";
import { locales, type Locale, type MessageKey } from "@/locales";

const DEMO_ROLE_KEY: Record<DemoAccountRole, MessageKey> = {
  staff: "demoRoleStaff",
  officer: "demoRoleOfficer",
  "officer-unverified": "demoRoleOfficerUnverified",
  admin: "demoRoleAdmin",
};

// Bangla 13 px captions read too small with conjuncts; they step up to 14 px.
const CAPTION = "text-caption-md [&:lang(bn)]:text-body-sm";

const inputClass = [
  "min-h-11 w-full min-w-0 rounded-md border border-control bg-elevated px-3 text-body-md text-ink",
  "transition-colors duration-(--duration-fast) ease-out",
  // D4 §13: control boundaries >= 3:1 at rest and on hover/focus (globals.css).
  "hover:border-control-strong focus:border-control-strong focus:shadow-1",
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

  const [state, dispatch] = useReducer(signInReducer, initialSignInState);
  const [showPassword, setShowPassword] = useState(false);
  const guard = useRef(createInFlightGuard());
  const usernameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const refs: Record<SignInField, RefObject<HTMLInputElement | null>> = { username: usernameRef, password: passwordRef };

  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      guard.current.leave();
      dispatch({ type: "pageshow" });
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  const busy = state.status !== "idle";
  const credentialsWrong = state.failure?.kind === "credentials";

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (guard.current.busy) return;
    const values = valuesFromFormData(new FormData(event.currentTarget));
    dispatch({ type: "submit", values });
    const missing: SignInField | null = values.username.trim() === "" ? "username" : values.password === "" ? "password" : null;
    if (missing) {
      refs[missing].current?.focus();
      return;
    }
    if (!guard.current.enter()) return;
    setShowPassword(false);

    const outcome = await requestSignIn(values, { next });
    if (outcome.kind === "redirect") {
      dispatch({ type: "outcome", outcome });
      window.location.replace(outcome.to); // full load: server components re-read the cookie
      return;
    }
    guard.current.leave();
    if (clearsPassword(outcome) && passwordRef.current) passwordRef.current.value = "";
    dispatch({ type: "outcome", outcome });
    const focus = focusAfter(outcome);
    if (focus) refs[focus].current?.focus();
  }

  function fillUsername(value: string) {
    if (usernameRef.current) usernameRef.current.value = value;
    dispatch({ type: "demo-fill", username: value });
    passwordRef.current?.focus();
  }

  const failureText = state.failure ? signInFailureText(state.failure, locale) : null;
  const FailureIcon = state.failure?.kind === "rate-limited" ? ClockIcon : CircleAlertIcon;
  const polite =
    state.status === "submitting"
      ? t.signingIn
      : state.status === "redirecting"
        ? t.signedInRedirecting
        : state.filled
          ? t.demoFilled.replace("{u}", state.filled)
          : "";

  const fieldError = (field: SignInField, errorId: string, text: string) =>
    state.required[field] && (
      <p id={errorId} className={`flex items-start gap-1.5 text-danger-text ${CAPTION}`}>
        <CircleAlertIcon className="mt-[0.2em] size-3.5" />
        <span>{text}</span>
      </p>
    );

  return (
    <div className="flex flex-col gap-4">
      <form
        method="post"
        noValidate
        aria-labelledby={titleId}
        onSubmit={onSubmit}
        className="flex flex-col rounded-lg border border-hairline bg-surface p-[16px] shadow-1 sm:p-6"
      >
        {/* Always mounted and never display:none, so screen readers watch it; it has no
            height until a failed attempt fills it. */}
        <div id={id.status} role="alert" aria-atomic="true">
          {failureText && (
            <p
              className={[
                "mb-5 flex items-start gap-2 rounded-md px-3 py-2.5 text-body-sm",
                state.failure?.kind === "rate-limited" ? "bg-warning-soft text-warning-text" : "bg-danger-soft text-danger-text",
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
            aria-invalid={state.invalid.username || undefined}
            aria-describedby={ids(state.required.username && id.usernameError, credentialsWrong && state.invalid.username && id.status)}
            onInput={(e) => dispatch({ type: "input", field: "username", value: e.currentTarget.value })}
            className={inputClass}
          />
          {fieldError("username", id.usernameError, t.usernameRequired)}
        </div>

        <div className="mt-5 flex flex-col gap-1.5">
          <label htmlFor={id.password} className="text-body-sm font-medium text-ink">
            {t.passwordLabel}
          </label>
          {/* Wraps at 320 px / 200 % text: the toggle drops below the input, and the input's
              10rem minimum never exceeds the row. */}
          <div className="flex flex-wrap gap-2">
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
              aria-invalid={state.invalid.password || undefined}
              aria-describedby={ids(state.required.password && id.passwordError, credentialsWrong && state.invalid.password && id.status)}
              onInput={(e) => dispatch({ type: "input", field: "password", value: e.currentTarget.value })}
              className={`${inputClass} min-w-[min(10rem,100%)] flex-1`}
            />
            <button
              type="button"
              aria-controls={id.password}
              aria-label={showPassword ? t.hidePasswordLabel : t.showPasswordLabel}
              onClick={() => setShowPassword((v) => !v)}
              className={[
                "inline-flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-md",
                "border border-control bg-elevated px-3 text-body-sm font-medium text-mute",
                "transition-colors duration-(--duration-fast) ease-out hover:border-control-strong hover:text-ink",
              ].join(" ")}
            >
              {showPassword ? <EyeOffIcon /> : <EyeIcon />}
              <span>{showPassword ? t.hidePasswordButton : t.showPasswordButton}</span>
            </button>
          </div>
          {fieldError("password", id.passwordError, t.passwordRequired)}
        </div>

        <button
          type="submit"
          aria-disabled={busy || undefined}
          className={[
            "mt-6 inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-md bg-primary px-5",
            "text-body-md font-medium text-on-primary",
            "transition-[transform,background-color] duration-(--duration-fast) ease-out",
            "hover:bg-primary-pressed active:scale-[0.97] active:bg-primary-pressed",
            "aria-disabled:cursor-progress aria-disabled:active:scale-100",
          ].join(" ")}
        >
          {busy ? <LoaderCircleIcon className="size-4 animate-spin" /> : <LogInIcon />}
          <span>{busy ? t.signingIn : t.signInAction}</span>
        </button>
        <p aria-live="polite" className="sr-only">
          {polite}
        </p>
      </form>

      {demo && demo.length > 0 && (
        <section aria-labelledby={id.demoTitle} className="rounded-lg border border-dashed border-hairline-strong p-[12px] sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id={id.demoTitle} className="text-body-sm font-medium text-ink">
              {t.demoAccountsTitle}
            </h2>
            <span
              lang="en"
              translate="no"
              className="rounded-xs border border-dashed border-hairline-strong px-1.5 text-caption-sm font-medium text-mute"
            >
              {t.mockLabel}
            </span>
          </div>
          <p className={`mt-1 text-mute ${CAPTION}`}>{t.demoAccountsNote}</p>
          <ul className="mt-2 flex flex-col">
            {demo.map((account) => (
              <li key={account.username} className="border-t border-hairline-soft first:border-t-0">
                <button
                  type="button"
                  onClick={() => fillUsername(account.username)}
                  className={[
                    "group flex min-h-11 w-full cursor-pointer flex-wrap items-center justify-between gap-x-3 gap-y-0.5",
                    "rounded-sm px-2 py-1.5 text-start transition-colors duration-(--duration-fast) ease-out",
                    "hover:bg-hover focus-visible:bg-hover",
                  ].join(" ")}
                >
                  <span className="sr-only">{t.demoAccountFill} </span>
                  <span lang="en" translate="no" className="font-mono text-body-sm break-all text-ink">
                    {account.username}
                  </span>
                  <span className={`inline-flex items-center gap-2 text-mute ${CAPTION}`}>
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
