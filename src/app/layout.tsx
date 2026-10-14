import type { Metadata } from "next";
import type { ReactNode } from "react";
import { locales } from "@/locales";
import "./globals.css";

export const metadata: Metadata = {
  title: `${locales.bn.appName} · ${locales.en.appName}`,
  description: locales.bn.metaDescription,
  // Synthetic prototype: keep it out of search so it is never mistaken for a live service.
  robots: { index: false, follow: false },
};

// Placeholder root layout (TASK-001). TASK-008 adds DESIGN.md tokens, self-hosted
// fonts and the COMP-022 language toggle (including the document `lang`).
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="bn">
      <body>{children}</body>
    </html>
  );
}
