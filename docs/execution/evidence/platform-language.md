# Evidence: platform shell and language (TASK-008)

Lane `mahim-shell`, branch `phase1--mahim-shell`, 2026-10-14 (Asia/Dhaka). Tool: Claude Code. Owner: Mahim.
Covers T008 and the headless-screenshot part of T022 (FR-033, COMP-022, NFR-011). **TASK-008 stays in `review`:** the Android phone check below is pending.

## What was built

- **Shell** (`src/app/layout.tsx`): `<html lang>` follows the chosen language. A skip link, then the COMP-022 header, then the D4 §15.1 demo banner, then `<main id="main">`. The shell owns `<main>`, so screens render inside it and must not add their own.
- **Header** (`src/app/components/app-header.tsx`): the wordmark links home. The demo banner "সিনথেটিক তথ্য · কর্মকর্তা যাচাই সিমুলেশন" / "Synthetic data · officer verification simulated" is part of the header on every page. It is a static `<p>` with an icon and the dashed "not real yet" edge, and it is not a live region.
- **Language toggle** (`src/app/components/language-toggle.tsx`, `src/app/actions/locale.ts`): a form that posts to a Server Action. It reads "বাংলা | English" in both modes. Each option is a `<button>` with its own `lang`, `aria-pressed` and a target of at least 44 × 44 px. The group label is in the current language ("ভাষা" / "Language"). The choice is stored in the `fera-lang` cookie (1 year, `HttpOnly`, `SameSite=Lax`, path `/`). It has no `Secure` flag because the finale laptop may be reached over plain HTTP on the LAN. The toggle works before hydration and with JavaScript off.
- **Locale resolution** (`src/lib/locale.ts`, `src/lib/locale-server.ts`): Bangla is the default (FR-033). Only the exact values `bn` and `en` are accepted; anything else falls back to `bn`. `cookies()` is awaited. `cacheComponents` stays off, so `/` is rendered dynamically.
- **Numerals** (`src/lib/numerals.ts`): `toBanglaDigits`, `toLatinDigits`, `localizeDigits(value, locale)` for parent screens in Bangla mode, and `dualNumerals` for officer screens ("১৩ / 13").
- **Tokens** (`src/app/globals.css`): DESIGN.md Paper and Cockpit values as semantic CSS variables, with the suggested names from DESIGN.md (`--bg-*`, `--text-*`, `--border*`, `--action-*`). These are mapped to Tailwind 4 through `@theme inline`, so utilities carry the DESIGN.md token names (`bg-surface`, `text-ink`, `border-hairline`, `shadow-1`, `rounded-lg`, `text-body-md`…).
  - Tailwind's default colours, radii, shadows and type sizes are cleared, so `bg-red-500` does not exist.
  - Paper is the default on `:root`, which covers the parent screens and the public entry. A `data-surface="desk"` element anywhere on the page switches the whole document, header included, to Cockpit through `:root:has(...)`. `data-theme="light"` keeps Paper available on desk screens.
  - `data-surface="parent"` resets `--danger*` and the signal gradient to `initial`, so red cannot render on parent screens (D4 §2.4).
  - Type: Bangla uses Noto Sans Bengali first and English uses Inter first, chosen by the per-element `lang`. Parent body is 18 px with line-height 1.7 (1.6 in English). Desk body is 16 px with line-height 1.55 (1.6 in English). Sizes are in `rem`.
  - Focus outline: 3 px with a 2 px offset (D4 §13). Selection, caret and scrollbar colours are themed. Durations drop to 0 under `prefers-reduced-motion`.
- **Fonts** (`src/app/fonts/`, loaded with `next/font/local`, `font-display: swap`): self-hosted woff2 with OFL texts next to them. No runtime CDN. Inter (Latin) and Noto Sans Bengali (Bengali, with `unicode-range`) are preloaded; JetBrains Mono is not.

  | File | Source | Bytes |
  |---|---|---|
  | `inter-latin-wght.woff2` | rsms/inter v4.1 release `InterVariable.ttf`. `opsz` pinned at 14, subset to Latin with `ss03`/`tnum`/`case` kept | 48,120 |
  | `jetbrains-mono-latin-wght.woff2` | `@fontsource-variable/jetbrains-mono@5.3.0`, unmodified | 40,404 |
  | `noto-sans-bengali-bengali-wght.woff2` | `@fontsource-variable/noto-sans-bengali@5.3.0`, unmodified | 107,720 |
  | **Total** | | **196,244** |

  Why Inter is re-subset: the GSUB tables were parsed from the woff2 files. The Fontsource/Google Fonts Inter Latin file contains `calt, ccmp, dnom, frac, locl, numr, pnum, tnum` and **no `ss03`**. DESIGN.md says `ss03` is "part of the voice", so Inter was subset from the official release instead; that file contains `calt, case, ccmp, dnom, frac, locl, numr, ss03, tnum`. The Noto Sans Bengali file keeps its Indic shaping features (`akhn, blwf, half, pres, pstf, rphf, …`). Sources and licences are listed in `THIRD_PARTY_NOTICES.md`.
- **Placeholder home** (`src/app/page.tsx`): a parent surface with the app name, the description and a dashed "পরিকল্পিত" / "Planned" note. It contains no feature screens.
- **Strings**: all new copy is in `src/locales/index.ts` in both Bangla and English. The `satisfies` parity check still applies.
- **Dependencies**: none added to `package.json`. The fonts, `fonttools` and `playwright-core` were used only from a scratch directory outside the repo.

## Commands and results

| Command | Exit | Result |
|---|---|---|
| `npm run lint` | 0 | clean |
| `npm run typecheck` | 0 | clean |
| `npm test` | 0 | 5 files, 54 tests passed (new: `numerals`, `locale`, `shell-tokens`, plus 3 added locale tests) |
| `npm run build` | 0 | `/` is dynamic (ƒ) |

### Headless browser check

Command, run against `npx next start -p 3108` after `npm run build`. `playwright-core@1.56.1` is installed in a scratch directory, not in the project, and drives Google Chrome 155 headless:

```
node docs/execution/evidence/platform-language/check-shell.mjs http://localhost:3108 <outDir>
```

Result: **30/30 checks passed**:
- default `lang="bn"`
- toggle text "বাংলা | English" in both modes
- group label in the current language
- `aria-pressed` and per-option `lang`
- targets 59×44 and 78×44 px
- exact banner copy in both languages, not a live region
- Noto Sans Bengali loaded for Bangla text
- parent body 18 px / 30.6 px in Bangla and 28.8 px leading in English
- Paper background on the parent surface, and `--danger` is empty there
- Tab, Tab, Tab, Tab then Enter switches to English (keyboard)
- cookie persisted and still applied after reload
- no horizontal scroll at 360 px or 320 px in either language, including with root text at 200 %
- the desk surface renders Cockpit (`rgb(7, 8, 10)`) at 16 px and keeps its danger token
- zero requests to other origins (no font CDN)
- the toggle works with JavaScript disabled

Screenshots in `docs/execution/evidence/platform-language/`:
- `platform-language-bn-360.png`: parent default, Bangla, 360 px
- `platform-language-en-360.png`: after switching to English by keyboard (focus ring visible)
- `platform-language-bn-320-200pct.png`, `platform-language-en-320-200pct.png`: 320 px with root text at 200 %
- `platform-language-desk-cockpit-sim-1280.png`: the placeholder home re-marked `data-surface="desk"` in the browser to show Cockpit. No desk screen exists yet.

Limits: the 200 % check scales the root font size, which approximates browser text zoom with `rem` units. It is not Chrome's own zoom setting. Contrast was not machine-measured on rendered pixels in this pass; the token values come unchanged from DESIGN.md.

## Pending (human only)

- **Android phone Bangla glyph check: PENDING (Mahim).** Open the deployed shell on one Android phone in Chrome. Confirm that the Bangla conjuncts and matras render correctly in the header, banner and toggle, and that the toggle switches language and persists. Record the device, Chrome version and a photo or screenshot here. TASK-008 cannot be `done` until this is recorded (T022 checkpoint).
- Playwright spec `tests/e2e/platform-language.spec.ts` and the bilingual SCREEN-008/016 states belong to T022 and T012–T013 (later).
