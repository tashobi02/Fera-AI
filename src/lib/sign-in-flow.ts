// COMP-047 submit state machine (SCREEN-008), pure so it is unit-tested without a browser.
//
//   validateSignIn   required-field check on the submitted FormData values
//   requestSignIn    one API-020 call: timeout, network, non-JSON, 401/429/other, success
//   signInReducer    form state: in-flight guard, field errors, aria-invalid, failure
//   createInFlightGuard  synchronous double-submit guard (state updates are async)
//
// The component only wires these to the DOM (focus, clearing the password input,
// location.replace).
import { destinationAfterSignIn, parseSignedInSession } from "@/lib/auth-paths";
import { classifySignInFailure, type SignInFailure } from "@/lib/sign-in-errors";

export const SIGN_IN_API = "/api/auth/sign-in";
export const SIGN_IN_TIMEOUT_MS = 15_000;

export type SignInField = "username" | "password";
export type FieldFlags = Record<SignInField, boolean>;
export type SignInValues = Record<SignInField, string>;

const NONE: FieldFlags = { username: false, password: false };

export function valuesFromFormData(data: FormData): SignInValues {
  const read = (name: SignInField) => {
    const value = data.get(name);
    return typeof value === "string" ? value : "";
  };
  return { username: read("username"), password: read("password") };
}

// The username is trimmed (the server trims it too); a password is never trimmed.
export function validateSignIn(values: SignInValues): FieldFlags {
  return { username: values.username.trim() === "", password: values.password === "" };
}

export type SignInOutcome = { kind: "redirect"; to: string } | { kind: "failure"; failure: SignInFailure };

const GENERIC: SignInOutcome = { kind: "failure", failure: { kind: "generic" } };

// Abort, timeout, offline and unreadable bodies all end as the generic failure.
export async function requestSignIn(
  values: SignInValues,
  opts: { next: string | null; fetchImpl?: typeof fetch; timeoutMs?: number },
): Promise<SignInOutcome> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await fetchImpl(SIGN_IN_API, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ username: values.username, password: values.password }),
      credentials: "same-origin",
      cache: "no-store",
      signal: AbortSignal.timeout(opts.timeoutMs ?? SIGN_IN_TIMEOUT_MS),
    });
  } catch {
    return GENERIC;
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (res.ok) {
    const session = parseSignedInSession(body);
    return session ? { kind: "redirect", to: destinationAfterSignIn(session, opts.next) } : GENERIC;
  }
  return { kind: "failure", failure: classifySignInFailure({ status: res.status, body, retryAfter: res.headers.get("retry-after") }) };
}

export type SignInState = {
  status: "idle" | "submitting" | "redirecting";
  failure: SignInFailure | null;
  required: FieldFlags; // field-level "enter your …" messages
  invalid: FieldFlags; // aria-invalid
  filled: string | null; // demo username just filled, for the polite announcement
};

export const initialSignInState: SignInState = { status: "idle", failure: null, required: NONE, invalid: NONE, filled: null };

export type SignInAction =
  | { type: "submit"; values: SignInValues }
  | { type: "outcome"; outcome: SignInOutcome }
  | { type: "input"; field: SignInField; value: string }
  | { type: "demo-fill"; username: string }
  | { type: "pageshow" };

export function signInReducer(state: SignInState, action: SignInAction): SignInState {
  switch (action.type) {
    case "submit": {
      if (state.status !== "idle") return state; // in flight or leaving: ignore
      const required = validateSignIn(action.values);
      if (required.username || required.password) return { ...state, failure: null, required, invalid: required, filled: null };
      return { status: "submitting", failure: null, required: NONE, invalid: NONE, filled: null };
    }
    case "outcome": {
      if (state.status !== "submitting") return state;
      if (action.outcome.kind === "redirect") return { ...state, status: "redirecting" };
      const failure = action.outcome.failure;
      // E-002 never says which field was wrong, so both are marked.
      const invalid = failure.kind === "credentials" ? { username: true, password: true } : NONE;
      return { ...state, status: "idle", failure, invalid };
    }
    case "input": {
      if (action.value === "" || (!state.required[action.field] && !state.invalid[action.field])) return state;
      return {
        ...state,
        required: { ...state.required, [action.field]: false },
        invalid: { ...state.invalid, [action.field]: false },
      };
    }
    case "demo-fill":
      return {
        ...state,
        filled: action.username,
        required: { ...state.required, username: false },
        invalid: { ...state.invalid, username: false },
      };
    case "pageshow":
      // Restored from the back/forward cache after leaving: the form must work again.
      return state.status === "idle" ? state : { ...state, status: "idle" };
  }
}

// Clears the password after a failed attempt, as the reducer cannot touch the DOM.
export function clearsPassword(outcome: SignInOutcome): boolean {
  return outcome.kind === "failure";
}

// Moves focus to the password after a credentials failure (D3: one generic message; the
// password is the field the user will retype).
export function focusAfter(outcome: SignInOutcome): SignInField | null {
  return outcome.kind === "failure" && outcome.failure.kind === "credentials" ? "password" : null;
}

export function createInFlightGuard() {
  let busy = false;
  return {
    enter(): boolean {
      if (busy) return false;
      busy = true;
      return true;
    },
    leave(): void {
      busy = false;
    },
    get busy(): boolean {
      return busy;
    },
  };
}
