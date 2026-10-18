"use client";

import { useEffect, useRef, type ReactNode } from "react";

// D3 SCREEN-016: focus moves to the heading so a screen-reader user hears the outcome
// first. tabIndex -1 makes it focusable from script only; it is not a tab stop, but it
// still needs a visible focus indicator (WCAG 2.4.11) so keyboard users can tell where
// focus landed. The :focus-visible style below keeps the indicator suppressed on click
// (the heading is reached only from script) and visible on programmatic focus.
export function FocusHeading({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <h1
      ref={ref}
      tabIndex={-1}
      className={`rounded-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring ${className ?? ""}`}
    >
      {children}
    </h1>
  );
}
