# Evidence: platform shell and language (TASK-008)

Lane `mahim-shell`, branch `phase1--mahim-shell`, 2026-10-14 (Asia/Dhaka). Tool: Claude Code. Owner: Mahim.
Covers T008 and the headless-screenshot part of T022 (FR-033, COMP-022, NFR-011). This revision applies the `fera-review` WARN fixes; the review returned no BLOCK findings.

**TASK-008 stays in `review`:** the Android phone check below is pending. TASK-001 (PR #1) is also still open and unmerged, and this lane is stacked on it.

## What was built

- **Shell** (`src/app/layout.tsx`)
  - `<html lang>` follows the chosen language.
  - Page order is: skip link, COMP-022 header, D4 §15.1 demo banner, then `<main id="main">`. The shell owns `<main>`, so screens render inside it and must not add their own.
  - The page title uses the template `%s · ফেরা` / `%s · Fera`.
- **Skip link**
  - Hidden until focused. On focus it sits in the page flow above the header, so it pushes the header down instead of covering the wordmark.
  - It is at least 44 px tall (45 px measured), with padding, a visible border and a light shadow.
- **Header** (`src/app/components/app-header.tsx`)
  - The wordmark links home.
  - The demo banner "সিনথেটিক তথ্য · কর্মকর্তা যাচাই সিমুলেশন" / "Synthetic data · officer verification simulated" appears on every page.
  - The banner is a named region (`<section aria-label="ডেমো নোটিশ" / "Demo notice">`), so screen-reader users can still reach it after using the skip link.
  - It has an icon and the dashed "not real yet" edge, and is never a live region.
- **Language toggle** (`src/app/components/language-toggle.tsx`, `src/app/actions/locale.ts`)
  - A form that posts to a Server Action. It reads "বাংলা | English" in both modes.
  - Each option is a `<button>` with its own `lang`, `aria-pressed`, and a target of at least 44 × 44 px.
  - The group label is in the current language.
  - **Selected state**, driven by `aria-pressed`:
    - text turns semibold and `--text-strong`, on the raised segment;
    - a 2 px bar in `--text-strong` sits under the label: 21:1 on Paper, 16.0:1 on Cockpit;
    - in forced-colors mode, a `Highlight` border and an underline replace them.
  - **The action writes nothing** unless its argument is a `FormData` whose `locale` is a supported code.
    - Validation uses `isLocale`, an own-key lookup on `locales` via `Object.hasOwn`, so `__proto__` and `constructor` are rejected.
    - Zod is not a declared dependency in this lane yet.
  - **Cookie `fera-lang`:** path `/`, 1 year, `HttpOnly`, `SameSite=Lax`, and `Secure` when `NODE_ENV=production` and `DEMO_MODE` is not `1`.
    - The `DEMO_MODE=1` laptop stack may be reached over plain HTTP on the LAN, so it drops `Secure`.
    - This cookie is a UI preference, not identity. The parent session cookie must not copy these options.
- **Locale resolution** (`src/lib/locale.ts`, `src/lib/locale-server.ts`)
  - Bangla is the default (FR-033). The toggle options come from the same `supportedLocales` list.
  - `cookies()` is awaited. `cacheComponents` stays off.
- **Numerals** (`src/lib/numerals.ts`, display only)
  - `toBanglaDigits`, `toLatinDigits`, `localizeDigits(value, locale)` and `dualNumerals` ("১৩ / 13").
  - Never apply them to stored values, `tel:` hrefs, UUIDs, reference keys or source spans.
  - Non-finite numbers throw a `RangeError` instead of printing "NaN".
- **Tokens** (`src/app/globals.css`)
  - DESIGN.md Paper and Cockpit values are semantic CSS variables. They are mapped to Tailwind 4 through `@theme inline`, so utilities carry the DESIGN.md token names. Tailwind's default colours, radii, shadows and type sizes are cleared.
  - **Themes:** Paper is the default. A `data-surface="desk"` element switches the whole document, header included, to Cockpit. `data-theme="light"` keeps Paper available on desk screens.
  - **No red by default:** `--danger*` and the signal gradient are defined only on `[data-surface="desk"]`, re-resolved on themed subtrees inside it, from private `--tone-danger*` values. Everywhere else they resolve to nothing: on the root, in the header, and on any parent screen, even one that forgets `data-surface="parent"`.
  - **Bangla typography:**
    - Heading and small-text line heights come from `--lh-*` variables set per `[lang]`. In Bangla, headings use 1.45, heading-sm/title 1.5, caption 1.6, and body-sm/md/lg 1.7.
    - Parent body is 18 px with line-height 1.7 (1.6 in English). Desk body is 16 px with 1.55 (1.6 in English).
    - `ss03` applies only to `[lang|="en"]` runs, not to `body`.
    - The mono stack falls back to Noto Sans Bengali after JetBrains Mono.
  - **Other base styles:**
    - `html` sets `scroll-padding-block` from `--sticky-top` / `--sticky-bottom`, ready for future sticky bars.
    - Focus outline is 3 px with a 2 px offset (D4 §13).
    - Selection, caret and scrollbar colours are themed.
    - Durations drop to 0 under `prefers-reduced-motion`.
- **Fonts** (`src/app/fonts/`, loaded with `next/font/local`, `font-display: swap`)
  - Self-hosted woff2 files with their OFL texts next to them. No runtime CDN.
  - Inter (Latin) and Noto Sans Bengali (Bengali, with `unicode-range`) are preloaded; JetBrains Mono is not.
  - Upstream and shipped sha256 / npm integrity are in `THIRD_PARTY_NOTICES.md`.

  | File | Source | Bytes |
  |---|---|---|
  | `inter-latin-wght.woff2` | rsms/inter v4.1 `InterVariable.ttf`, `opsz` pinned at 14, subset to Latin with `ss03`, `tnum` and `case` kept | 48,120 |
  | `jetbrains-mono-latin-wght.woff2` | `@fontsource-variable/jetbrains-mono@5.3.0`, unmodified | 40,404 |
  | `noto-sans-bengali-bengali-wght.woff2` | `@fontsource-variable/noto-sans-bengali@5.3.0`, unmodified | 107,720 |
  | **Total** | | **196,244** |

  The Fontsource/Google Fonts Inter Latin file has no `ss03` in its GSUB table (`calt, ccmp, dnom, frac, locl, numr, pnum, tnum`). The re-subset file has `calt, case, ccmp, dnom, frac, locl, numr, ss03, tnum`.
- **Placeholder home** (`src/app/page.tsx`): a parent surface with the app name, the description and a dashed "পরিকল্পিত" / "Planned" note. It contains no feature screens.
- **Strings:** all copy lives in `src/locales/index.ts` in both languages, with the `satisfies` parity check. New key: `demoBannerRegion`.
- **Dependencies:** none added to `package.json`.

## D4-over-DESIGN contrast overrides

D4 §13 (text at least 4.5:1, non-text at least 3:1) wins over DESIGN.md hex values. Ratios were computed with the WCAG 2.x relative-luminance formula. `tests/token-contrast.test.ts` recomputes them from `globals.css` on every test run.

| Token | Theme | DESIGN.md | Now | Before → after |
|---|---|---|---|---|
| `--link` | Paper | #0075de | **#005bab** | 4.19 → 6.25:1 on canvas (6.81:1 on surface) |
| `--info-text` (on `--info-soft` over surface) | Paper | #0075de | **#005bab** | 3.99 → 5.95:1 |
| `--text-faint` | Paper | #a39e98 | **#6f6a66** | 2.44 → 4.91:1 on canvas (5.34:1 on surface) |
| `--text-faint` | Cockpit | #6a6b6c | **#8a8b8c** | 3.75 → 5.87:1 on canvas (5.54:1 on elevated) |

All other checked pairs pass at their DESIGN.md values in both themes:
- body, strong, muted and faint text on canvas, surface and elevated;
- primary button text on its fill;
- success and warning text, and desk danger text, on their soft fills;
- focus ring against canvas and surface (non-text);
- the selected-language bar (non-text).

## Bangla copy for owner approval

- `metaDescription` (bn) is now "নিখোঁজ ও পাওয়া-যাওয়া শিশুর কেস সমন্বয়ের সিনথেটিক তথ্যভিত্তিক প্রোটোটাইপ". It follows the glossary term নিখোঁজ.
- `demoBannerRegion` (bn) is "ডেমো নোটিশ".
- **A Bangla-speaking owner should approve both strings before G1.**

## Commands and results

| Command | Exit | Result |
|---|---|---|
| `npm run lint` | 0 | clean |
| `npm run typecheck` | 0 | clean |
| `npm test` | 0 | 7 files, 120 tests passed |
| `npm run build` | 0 | `/` is dynamic (ƒ) |

The 120 tests include these new or updated files:
- `locale` and `locale-cookie` (`setLocale`/`getLocale` with mocked `next/headers`);
- `numerals`;
- `globals-css-source-guard`;
- `token-contrast`;
- `locales`;
- the existing `docs-integrity`.

### Headless browser check

The script header in `docs/execution/evidence/platform-language/check-shell.mjs` explains the setup:
- `playwright-core@1.56.1` is installed in a scratch directory, never in the project, and drives Google Chrome 155 headless;
- the script resolves `playwright-core` from the current directory.

```
npm run build && npx next start -p 3108            # production mode
cd <scratch-with-playwright-core>
EXPECT_SECURE=1 node <repo>/docs/execution/evidence/platform-language/check-shell.mjs http://localhost:3108 <outDir>

DEMO_MODE=1 npx next start -p 3108                 # laptop stack mode
EXPECT_SECURE=0 node <repo>/docs/execution/evidence/platform-language/check-shell.mjs http://localhost:3108 <outDir>
```

**Results:**
- Production mode: **37/37 passed**.
- `DEMO_MODE=1` mode: **37/37 passed**, with the cookie `Secure=false` as expected.

**Checks covered:**
- **Defaults and toggle**
  - Default `lang="bn"`; the toggle text reads "বাংলা | English" in both modes; group and banner labels are in the current language.
  - `aria-pressed` and per-option `lang` are set.
  - Selected-state cue: weight 600 plus an ink bar. The desk bar is `rgb(244,244,246)`.
  - Targets are 60×44 and 78×44 px, and at least 44 px under 200 % text (96×88 px).
- **Banner:** exact copy in both languages; a named region; not a live region; Bangla line-height 1.70.
- **Fonts and type:**
  - Noto Sans Bengali loaded.
  - Parent body is 18 px / 30.6 px in Bangla, and 28.8 px leading in English.
- **Colour:**
  - Paper background on the parent surface.
  - `--danger` is empty on the root, the header and the parent surface. The desk surface has it; the header outside the desk does not.
  - The desk surface renders Cockpit at 16 px.
- **Navigation and persistence:**
  - The skip link is the first Tab stop, 45 px tall, and does not overlap the wordmark.
  - Tab to English then Enter switches the language.
  - Cookie value, path, ~365-day lifetime, `HttpOnly`, `Lax` and `Secure` per mode; the choice survives reload.
- **Layout:** no horizontal scroll at 360 px or at 320 px in either language, including with root text at 200 %.
- **Robustness:**
  - The toggle works with JavaScript disabled.
  - No requests go to any origin other than the server under test, comparing `URL.origin` across every browser context.

**Screenshots** (production run) in `docs/execution/evidence/platform-language/`:
- `platform-language-bn-360.png`: parent default, Bangla, 360 px.
- `platform-language-skip-link-focused.png`: skip link focused, above the header.
- `platform-language-en-360.png`: after switching to English by keyboard, focus ring visible.
- `platform-language-bn-320-200pct.png`, `platform-language-en-320-200pct.png`: 320 px with root text at 200 %.
- `platform-language-desk-cockpit-sim-1280.png`: the placeholder home re-marked `data-surface="desk"` in the browser to show Cockpit. No desk screen exists yet.

**Limits:**
- The 200 % check scales the root font size. With `rem` units this approximates browser text zoom, but it is not Chrome's zoom setting.
- Contrast is computed from token values, not sampled from rendered pixels.

## Process note

- The `impeccable` skill's context loader and its craft-floor and Operate-mode references were read and followed for this build.
- Impeccable's design-detector hook and its `audit`/`polish` commands were not run.
- The review was the `fera-review` gate run by the coordinator.

## Open (not built here)

- **Android phone Bangla glyph check: PENDING (Mahim, human only).**
  - Open the deployed shell on one Android phone in Chrome.
  - Confirm that the Bangla conjuncts and matras render correctly in the header, banner and toggle, and that the toggle switches language and persists.
  - Record the device, Chrome version and a photo or screenshot here.
  - TASK-008 cannot be `done` until this is recorded (T022 checkpoint).
- **Bilingual states:** `error.tsx`, `global-error.tsx` and `not-found.tsx` (SCREEN-016) belong to T012/T013.
- **Toggle pending state:** a `useFormStatus` pending state for the toggle is deferred.
- **E2E spec:** the Playwright spec `tests/e2e/platform-language.spec.ts` and the bilingual SCREEN-008/016 states belong to T022 and T012–T013.
- **Bangla copy approval:** see the section above.
