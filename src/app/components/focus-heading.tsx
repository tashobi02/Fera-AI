"use client";

import { useEffect, useRef, type ReactNode } from "react";

// D3 SCREEN-016: focus moves to the heading, so a screen-reader user hears the outcome
// first. tabIndex -1 makes it focusable from script only; it is not a tab stop, and it
// shows no focus ring because it is not a control.
export function FocusHeading({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <h1 ref={ref} tabIndex={-1} className={`outline-none ${className ?? ""}`}>
      {children}
    </h1>
  );
}
