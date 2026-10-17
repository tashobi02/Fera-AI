import type { ReactNode } from "react";

// Lucide outline icons (ISC, third_party/lucide.LICENSE), same grid, stroke and rules as
// icons.tsx (24 × 24, 2 px, currentColor, decorative). Kept in its own file so the match-
// review lane and the found-log lane, which both need CircleCheckIcon, do not conflict in
// icons.tsx; fold them into icons.tsx once both are merged.
function Icon({ children, className = "size-4" }: { children: ReactNode; className?: string }) {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${className}`}>
      {children}
    </svg>
  );
}
type IconProps = { className?: string };

export function CircleCheckIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <circle cx="12" cy="12" r="10" />
      <path d="m9 12 2 2 4-4" />
    </Icon>
  );
}

export function CircleXIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <circle cx="12" cy="12" r="10" />
      <path d="m15 9-6 6" />
      <path d="m9 9 6 6" />
    </Icon>
  );
}

export function CircleHelpIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <path d="M12 17h.01" />
    </Icon>
  );
}
