"use client";

// COMP-043 verify officers [MOCK] panel (SCREEN-013 ACT-028 → API-017; list from API-021).
// The first page is rendered on the server through the same service and contract
// projection as API-021; "Show more" fetches the next page from API-021.
//
// - Status is icon + text + colour (D4): verified (success), not verified, inactive and
//   not applicable (neutral). No red.
// - Only officer rows have the toggle (API-017 refuses other roles with E-004). Its
//   visible label carries "[MOCK]" and its description points at the account's name.
// - One request per row at a time (aria-disabled while saving). Saving, the outcome and
//   "N more shown" are announced in one polite region; a failure goes to the alert region
//   with the catalogue copy. Each toggle's name starts with its visible text and ends with
//   the account's name, so voice control and button lists can tell the rows apart.
// - When the last page loads, "Show more" unmounts and focus moves to the list.
import { useId, useRef, useState } from "react";
import {
  ChevronDownIcon,
  CircleAlertIcon,
  CircleCheckIcon,
  CircleDashedIcon,
  CircleSlashIcon,
  LoaderCircleIcon,
  MinusIcon,
  ShieldCheckIcon,
  ShieldOffIcon,
} from "@/app/components/icons";
import type { AdminUsersResponse } from "@/contracts";
import {
  ROLE_KEY,
  USER_STATUS_KEY,
  adminFailureText,
  canToggleVerification,
  mergeUsersPage,
  moreUsersText,
  nameLang,
  requestUsersPage,
  requestVerification,
  userStatus,
  verifiedText,
  type AdminFailure,
  type UserStatus,
} from "@/lib/admin-tools";
import { locales, type Locale } from "@/locales";

type User = AdminUsersResponse["users"][number];

const STATUS_STYLE: Record<
  UserStatus,
  { Icon: typeof CircleCheckIcon; className: string }
> = {
  verified: {
    Icon: CircleCheckIcon,
    className: "bg-success-soft text-success-text",
  },
  unverified: {
    Icon: CircleDashedIcon,
    className: "border border-hairline bg-elevated text-mute",
  },
  inactive: {
    Icon: CircleSlashIcon,
    className: "border border-hairline bg-elevated text-mute",
  },
  "not-officer": { Icon: MinusIcon, className: "text-faint" },
};

function MockChip({ label }: { label: string }) {
  return (
    <span
      lang="en"
      translate="no"
      className="rounded-xs border border-dashed border-hairline-strong px-1.5 text-caption-sm font-medium text-mute"
    >
      {label}
    </span>
  );
}

export function VerifyOfficersForm({
  locale,
  initial,
}: {
  locale: Locale;
  initial: AdminUsersResponse | null;
}) {
  const t = locales[locale];
  const uid = useId();
  const titleId = `${uid}-title`;
  const [users, setUsers] = useState<User[]>(initial?.users ?? []);
  const [cursor, setCursor] = useState<string | null>(
    initial?.next_cursor ?? null,
  );
  const [saving, setSaving] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [failure, setFailure] = useState<AdminFailure | null>(null);
  const inFlight = useRef(false);
  const listRef = useRef<HTMLUListElement>(null);

  async function toggle(user: User) {
    if (inFlight.current) return;
    inFlight.current = true;
    setSaving(user.id);
    setFailure(null);
    setAnnouncement(t.verifySaving);
    let outcome;
    try {
      outcome = await requestVerification(user.id, !user.verified);
    } finally {
      inFlight.current = false;
      setSaving(null);
    }
    if (outcome.kind === "failed") {
      setAnnouncement("");
      setFailure(outcome.failure);
      return;
    }
    const verified = outcome.data.verified;
    setUsers((list) =>
      list.map((u) => (u.id === outcome.data.id ? { ...u, verified } : u)),
    );
    setAnnouncement(verifiedText(user.display_name, verified, locale));
  }

  async function loadMore() {
    if (!cursor || inFlight.current) return;
    inFlight.current = true;
    setLoadingMore(true);
    setFailure(null);
    setAnnouncement(t.usersLoading);
    let outcome;
    try {
      outcome = await requestUsersPage(cursor);
    } finally {
      inFlight.current = false;
      setLoadingMore(false);
    }
    if (outcome.kind === "failed") {
      setAnnouncement("");
      setFailure(outcome.failure);
      return;
    }
    const merged = mergeUsersPage(users, outcome.data.users);
    setUsers(merged.users);
    setCursor(outcome.data.next_cursor);
    setAnnouncement(moreUsersText(merged.added, locale));
    if (outcome.data.next_cursor === null) listRef.current?.focus();
  }

  return (
    <section
      aria-labelledby={titleId}
      className="rounded-lg border border-hairline bg-surface"
    >
      <div className="flex flex-col gap-3 p-[16px] sm:p-6">
        <div className="flex flex-wrap items-center gap-3">
          <span
            aria-hidden="true"
            className="inline-flex size-9 items-center justify-center rounded-md bg-card text-mute"
          >
            <ShieldCheckIcon />
          </span>
          <h2 id={titleId} className="text-title font-semibold text-ink">
            {t.verifyTitle} <MockChip label={t.mockLabel} />
          </h2>
        </div>
        <p className="max-w-[65ch] rounded-md border border-dashed border-hairline-strong px-3 py-2.5 text-body-sm text-body">
          {t.verifyMockNote}
        </p>
      </div>

      <div className="border-t border-hairline">
        <p aria-live="polite" aria-atomic="true" className="sr-only">
          {announcement}
        </p>
        <div role="alert" aria-atomic="true">
          {failure && (
            <p className="m-[16px] flex items-start gap-2 rounded-md bg-danger-soft px-3 py-2.5 text-body-sm text-danger-text sm:mx-6">
              <CircleAlertIcon className="mt-[0.2em] size-4" />
              <span>{adminFailureText(failure, locale)}</span>
            </p>
          )}
        </div>

        {initial === null ? (
          <p className="flex items-start gap-2 p-[16px] text-body-sm text-mute sm:px-6">
            <CircleAlertIcon className="mt-[0.2em] size-4" />
            <span>{t.usersUnavailable}</span>
          </p>
        ) : users.length === 0 ? (
          <p className="p-[16px] text-body-md text-body sm:px-6">
            {t.usersEmpty}
          </p>
        ) : (
          <ul
            ref={listRef}
            role="list"
            tabIndex={-1}
            aria-label={t.usersCaption}
            className="flex flex-col outline-none"
          >
            {users.map((user) => {
              const status = userStatus(user);
              const { Icon, className } = STATUS_STYLE[status];
              const busy = saving === user.id;
              return (
                <li
                  key={user.id}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-hairline-soft px-[16px] py-3 first:border-t-0 sm:px-6"
                >
                  <div className="flex min-w-0 flex-1 basis-[14rem] flex-col">
                    <span
                      lang={nameLang(user.display_name)}
                      className="text-body-sm font-medium break-words text-ink"
                    >
                      {user.display_name}
                    </span>
                    <span
                      lang="en"
                      translate="no"
                      className="font-mono text-caption-md break-all text-mute"
                    >
                      {user.username}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-body-sm text-body">
                      <span className="sr-only">{t.colRole}: </span>
                      {t[ROLE_KEY[user.role]]}
                    </span>
                    <span
                      className={`inline-flex min-h-6 items-center gap-1.5 rounded-xs px-2 text-caption-md font-medium [&:lang(bn)]:text-body-sm ${className}`}
                    >
                      <span className="sr-only">{t.colStatus}: </span>
                      <Icon className="size-3.5" />
                      {t[USER_STATUS_KEY[status]]}
                    </span>
                  </div>
                  {canToggleVerification(user) && (
                    <button
                      type="button"
                      onClick={() => toggle(user)}
                      aria-label={`${busy ? t.verifySaving : user.verified ? t.unverifyAction : t.verifyAction} ${t.mockLabel}: ${user.display_name}`}
                      aria-disabled={
                        saving !== null || loadingMore || undefined
                      }
                      className={[
                        "inline-flex min-h-11 max-w-full cursor-pointer flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-control bg-elevated px-4 py-2 text-start",
                        "text-body-sm font-medium text-ink transition-colors duration-(--duration-fast) ease-out",
                        "hover:border-control-strong hover:bg-hover aria-disabled:cursor-progress",
                      ].join(" ")}
                    >
                      {busy ? (
                        <LoaderCircleIcon className="size-4 animate-spin motion-reduce:animate-none" />
                      ) : user.verified ? (
                        <ShieldOffIcon />
                      ) : (
                        <ShieldCheckIcon />
                      )}
                      <span>
                        {busy
                          ? t.verifySaving
                          : user.verified
                            ? t.unverifyAction
                            : t.verifyAction}
                      </span>
                      <MockChip label={t.mockLabel} />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {cursor && (
          <div className="border-t border-hairline-soft px-[16px] py-3 sm:px-6">
            <button
              type="button"
              onClick={loadMore}
              aria-disabled={loadingMore || saving !== null || undefined}
              className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-3 text-body-sm font-medium text-body hover:bg-hover hover:text-ink aria-disabled:cursor-progress"
            >
              {loadingMore ? (
                <LoaderCircleIcon className="size-4 animate-spin motion-reduce:animate-none" />
              ) : (
                <ChevronDownIcon />
              )}
              <span>{loadingMore ? t.usersLoading : t.usersLoadMore}</span>
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
