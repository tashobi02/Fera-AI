---
version: 1.0
name: Cockpit & Paper
description: |
  A dual-theme product UI system for focused, keyboard-friendly tools. Dark mode ("Cockpit") is the default: a near-black surface ladder, 1px hairlines, a single white action, Inter with ss03 on. Light mode ("Paper") is a warm off-white desk: white cards, an ink text ramp, one blue action, barely-there layered shadows. Both themes share one type system, one radius and spacing scale, one set of semantic accents, and one decorative "sticker" palette. Dark-mode structure comes from Raycast's design language and light-mode structure from Notion's. Brand-agnostic; first built for Helm AI and adopted for Fera with the "Fera overrides" section, which wins over everything else in this file.

colors:
  # ── Dark (default) ──
  primary: "#ffffff"
  primary-pressed: "#e8e8e8"
  on-primary: "#000000"
  canvas: "#07080a"
  surface: "#0d0d0d"
  surface-elevated: "#101111"
  surface-card: "#121212"
  surface-deep: "#18191a"
  surface-hover: "#121212"
  surface-selected: "#121212"
  hairline: "#242728"
  hairline-soft: "rgba(255,255,255,0.08)"
  hairline-strong: "rgba(255,255,255,0.16)"
  ink: "#f4f4f6"
  body: "#cdcdcd"
  mute: "#9c9c9d"
  faint: "#6a6b6c"
  disabled: "#434345"
  link: "#ffffff"
  focus-ring: "#57c1ff"
  scrim: "rgba(0,0,0,0.64)"
  info: "#57c1ff"
  info-soft: "rgba(87,193,255,0.15)"
  info-text: "#57c1ff"
  success: "#59d499"
  success-soft: "rgba(89,212,153,0.15)"
  success-text: "#59d499"
  warning: "#ffc533"
  warning-soft: "rgba(255,197,51,0.15)"
  warning-text: "#ffc533"
  danger: "#ff6161"
  danger-soft: "rgba(255,97,97,0.15)"
  danger-text: "#ff6161"
  keycap-start: "#121212"
  keycap-end: "#0d0d0d"
  # ── Shared: sticker palette (decoration only) ──
  sticker-purple: "#d6b6f6"
  sticker-purple-deep: "#391c57"
  sticker-sky: "#62aef0"
  sticker-pink: "#ff64c8"
  sticker-orange: "#dd5b00"
  sticker-orange-deep: "#793400"
  sticker-teal: "#2a9d99"
  sticker-green: "#1aae39"
  sticker-brown: "#523410"
  # ── Shared: signal gradient (one moment per surface) ──
  signal-start: "#ff5757"
  signal-end: "#a1131a"

colors-light:
  # Same keys as `colors`; applied under [data-theme="light"].
  primary: "#0075de"
  primary-pressed: "#005bab"
  on-primary: "#ffffff"
  canvas: "#f6f5f4"
  surface: "#ffffff"
  surface-elevated: "#ffffff"
  surface-card: "#f6f5f4"
  surface-deep: "#f6f5f4"
  surface-hover: "rgba(0,0,0,0.04)"
  surface-selected: "rgba(0,0,0,0.05)"
  hairline: "#e6e6e6"
  hairline-soft: "rgba(0,0,0,0.06)"
  hairline-strong: "#dddddd"
  ink: "#000000"
  body: "#31302e"
  mute: "#615d59"
  faint: "#a39e98"
  disabled: "#a39e98"
  link: "#0075de"
  focus-ring: "#0075de"
  scrim: "rgba(15,15,15,0.4)"
  info: "#0075de"
  info-soft: "rgba(0,117,222,0.1)"
  info-text: "#0075de"
  success: "#1aae39"
  success-soft: "rgba(26,174,57,0.12)"
  success-text: "oklch(50% 0.15 145)"   # ≈ #237b2e
  warning: "#dd5b00"
  warning-soft: "rgba(221,91,0,0.1)"
  warning-text: "oklch(52% 0.15 50)"    # ≈ #a8500a
  danger: "oklch(58% 0.2 25)"           # ≈ #d4403f
  danger-soft: "rgba(214,48,49,0.1)"
  danger-text: "oklch(52% 0.2 25)"      # ≈ #bf2c30
  keycap-start: "#ffffff"
  keycap-end: "#f6f5f4"

typography:
  # Fera: Bangla text uses Noto Sans Bengali (see "Fera overrides"); Inter has no Bengali glyphs.
  body-bn-parent: { fontFamily: Noto Sans Bengali, fontSize: 18px, fontWeight: 400, lineHeight: 1.7, letterSpacing: 0 }
  body-bn-desk:   { fontFamily: Noto Sans Bengali, fontSize: 16px, fontWeight: 400, lineHeight: 1.55, letterSpacing: 0 }
  display-1:   { fontFamily: Inter, fontSize: 64px, fontWeight: 700, lineHeight: 1.0,  letterSpacing: -2.125px, fontFeature: &ss03 '"calt", "kern", "liga", "ss03"' }
  display-2:   { fontFamily: Inter, fontSize: 54px, fontWeight: 700, lineHeight: 1.04, letterSpacing: -1.875px, fontFeature: *ss03 }
  heading-1:   { fontFamily: Inter, fontSize: 40px, fontWeight: 700, lineHeight: 1.1,  letterSpacing: -1px,     fontFeature: *ss03 }
  heading-2:   { fontFamily: Inter, fontSize: 26px, fontWeight: 700, lineHeight: 1.23, letterSpacing: -0.625px, fontFeature: *ss03 }
  heading-3:   { fontFamily: Inter, fontSize: 22px, fontWeight: 700, lineHeight: 1.27, letterSpacing: -0.25px,  fontFeature: *ss03 }
  title:       { fontFamily: Inter, fontSize: 20px, fontWeight: 600, lineHeight: 1.4,  letterSpacing: -0.125px, fontFeature: *ss03 }
  heading-sm:  { fontFamily: Inter, fontSize: 18px, fontWeight: 500, lineHeight: 1.4,  letterSpacing: 0.2px,    fontFeature: *ss03 }
  body-lg:     { fontFamily: Inter, fontSize: 18px, fontWeight: 400, lineHeight: 1.6,  letterSpacing: 0,        fontFeature: *ss03 }
  body-md:     { fontFamily: Inter, fontSize: 16px, fontWeight: 400, lineHeight: 1.6,  letterSpacing: 0,        fontFeature: *ss03 }
  body-strong: { fontFamily: Inter, fontSize: 16px, fontWeight: 500, lineHeight: 1.4,  letterSpacing: 0.2px,    fontFeature: *ss03 }
  body-sm:     { fontFamily: Inter, fontSize: 14px, fontWeight: 400, lineHeight: 1.6,  letterSpacing: 0,        fontFeature: *ss03 }
  body-sm-strong: { fontFamily: Inter, fontSize: 14px, fontWeight: 500, lineHeight: 1.6, letterSpacing: 0.2px,  fontFeature: *ss03 }
  button:      { fontFamily: Inter, fontSize: 14px, fontWeight: 500, lineHeight: 1.6,  letterSpacing: 0.2px,    fontFeature: *ss03 }
  caption-md:  { fontFamily: Inter, fontSize: 13px, fontWeight: 400, lineHeight: 1.4,  letterSpacing: 0.1px,    fontFeature: *ss03 }
  caption-sm:  { fontFamily: Inter, fontSize: 12px, fontWeight: 400, lineHeight: 1.5,  letterSpacing: 0.4px,    fontFeature: *ss03 }
  eyebrow:     { fontFamily: Inter, fontSize: 12px, fontWeight: 600, lineHeight: 1.33, letterSpacing: 0.125px,  fontFeature: *ss03, textTransform: uppercase }
  mono-display: { fontFamily: JetBrains Mono, fontSize: 64px, fontWeight: 500, lineHeight: 1.0, letterSpacing: -2px, fontFeature: '"tnum"' }
  mono-md:     { fontFamily: JetBrains Mono, fontSize: 13px, fontWeight: 500, lineHeight: 1.4, letterSpacing: 0, fontFeature: '"tnum"' }
  mono-sm:     { fontFamily: JetBrains Mono, fontSize: 12px, fontWeight: 400, lineHeight: 1.4, letterSpacing: 0, fontFeature: '"tnum"' }

rounded:
  none: 0px
  xs: 4px
  sm: 6px
  md: 8px
  lg: 10px
  xl: 16px
  full: 9999px

spacing:
  xxs: 2px
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  xxl: 32px
  3xl: 48px
  4xl: 64px
  section: 96px

size:
  control-sm: 28px
  control-md: 36px
  control-lg: 44px
  sidebar: 240px
  side-panel: 360px
  content-max: 1240px

elevation:
  # Dark: no shadows; elevation = surface ladder. Light: Notion micro-shadows.
  shadow-1-dark: none
  shadow-2-dark: none
  shadow-1-light: "rgba(0,0,0,0.01) 0 0.175px 1.041px, rgba(0,0,0,0.02) 0 0.8px 2.925px, rgba(0,0,0,0.027) 0 2.025px 7.847px, rgba(0,0,0,0.04) 0 4px 18px"
  shadow-2-light: "rgba(0,0,0,0.01) 0 1px 3px, rgba(0,0,0,0.02) 0 3px 7px, rgba(0,0,0,0.02) 0 7px 15px, rgba(0,0,0,0.04) 0 14px 28px, rgba(0,0,0,0.05) 0 23px 52px"
  focus: "0 0 0 2px {colors.canvas}, 0 0 0 4px {colors.focus-ring}"

motion:
  ease-out: "cubic-bezier(0.2, 0.8, 0.2, 1)"
  ease-in-out: "cubic-bezier(0.65, 0, 0.35, 1)"
  duration-fast: 120ms
  duration-base: 200ms
  duration-slow: 360ms
  press-scale: 0.97

components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    padding: 0 16px
    height: 36px
  button-primary-pressed:
    backgroundColor: "{colors.primary-pressed}"
    transform: "scale(0.97)"
  button-tertiary:
    backgroundColor: "{colors.surface-elevated}"   # light: rgba(0,0,0,0.05)
    textColor: "{colors.ink}"
    border: "1px solid {colors.hairline}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    padding: 0 16px
    height: 36px
  button-secondary:
    backgroundColor: transparent
    textColor: "{colors.ink}"
    border: "1px solid {colors.hairline-strong}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    height: 36px
  button-ghost:
    backgroundColor: transparent
    textColor: "{colors.body}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    height: 36px
  button-danger:
    backgroundColor: "{colors.danger-soft}"
    textColor: "{colors.danger-text}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    height: 36px
  button-disabled:
    backgroundColor: "{colors.surface-elevated}"
    textColor: "{colors.disabled}"
    border: "1px solid {colors.hairline}"
  icon-button:
    backgroundColor: transparent
    textColor: "{colors.mute}"
    rounded: "{rounded.md}"
    size: 36px
  keycap:
    background: "linear-gradient(180deg, {colors.keycap-start}, {colors.keycap-end})"
    textColor: "{colors.body}"
    border: "1px solid {colors.hairline}"
    typography: "{typography.caption-md}"
    rounded: "{rounded.xs}"
    height: 20px
    padding: 1px 6px
  badge-neutral:
    backgroundColor: "{colors.surface-elevated}"
    textColor: "{colors.mute}"
    border: "1px solid {colors.hairline}"
    typography: "{typography.caption-sm}"
    rounded: "{rounded.xs}"
    height: 20px
    padding: 2px 8px
  badge-semantic:
    backgroundColor: "{colors.<tone>-soft}"
    textColor: "{colors.<tone>-text}"
    typography: "{typography.caption-sm}"
    rounded: "{rounded.xs}"
    padding: 2px 8px
  text-input:
    backgroundColor: "{colors.surface-elevated}"
    textColor: "{colors.ink}"
    border: "1px solid {colors.hairline}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    padding: 0 12px
    height: 36px
  text-input-focused:
    border: "1px solid {colors.hairline-strong}"
  text-input-error:
    border: "1px solid {colors.danger}"
  search-bar:
    backgroundColor: "{colors.surface-elevated}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    padding: 0 16px
    height: 44px
  checkbox:
    size: 16px
    rounded: "{rounded.xs}"
    border: "1px solid {colors.hairline-strong}"
  checkbox-checked:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
  switch:
    width: 32px
    height: 18px
    rounded: "{rounded.full}"
    backgroundColor: "{colors.hairline-strong}"
  switch-on:
    backgroundColor: "{colors.primary}"
  segmented-control:
    backgroundColor: "{colors.surface-elevated}"
    border: "1px solid {colors.hairline}"
    rounded: "{rounded.md}"
    padding: 2px
  segmented-option-active:
    backgroundColor: "{colors.surface-deep}"   # light: #ffffff + shadow-1
    textColor: "{colors.ink}"
    border: "1px solid {colors.hairline-strong}"
    rounded: "{rounded.sm}"
  pill-tab:
    backgroundColor: transparent
    textColor: "{colors.body}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.full}"
    padding: 4px 10px
  pill-tab-active:
    backgroundColor: "{colors.surface-selected}"
    textColor: "{colors.ink}"
    border: "1px solid {colors.hairline}"
  nav-item:
    backgroundColor: transparent
    textColor: "{colors.body}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.sm}"
    height: 32px
    padding: 0 10px
  nav-item-active:
    backgroundColor: "{colors.surface-selected}"
    textColor: "{colors.ink}"
    typography: "{typography.body-sm-strong}"
  card:
    backgroundColor: "{colors.surface}"
    border: "1px solid {colors.hairline}"
    rounded: "{rounded.lg}"
    padding: 16px–24px
  card-elevated:
    backgroundColor: "{colors.surface-elevated}"
    border: "1px solid {colors.hairline-strong}"
    shadow: "{elevation.shadow-1-*}"
    rounded: "{rounded.xl}"
  command-row:
    backgroundColor: transparent
    textColor: "{colors.ink}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.sm}"
    padding: 6px 10px
  command-row-active:
    backgroundColor: "{colors.surface-selected}"
  icon-tile:
    backgroundColor: "{colors.surface-card}"
    border: "1px solid {colors.hairline}"
    rounded: "{rounded.sm}–{rounded.md}"
    size: 24px–32px
  toast:
    backgroundColor: "{colors.surface-elevated}"
    border: "1px solid {colors.hairline-strong}"
    shadow: "{elevation.shadow-2-*}"
    rounded: "{rounded.lg}"
    padding: 12px 14px
    width: 360px
  dialog:
    backgroundColor: "{colors.surface}"
    border: "1px solid {colors.hairline-strong}"
    shadow: "{elevation.shadow-2-*}"
    rounded: "{rounded.xl}"
    padding: 20px
  dialog-footer:
    backgroundColor: "{colors.surface-deep}"
    borderTop: "1px solid {colors.hairline}"
    padding: 12px 20px
  tooltip:
    backgroundColor: "{colors.surface-deep}"
    border: "1px solid {colors.hairline-strong}"
    typography: "{typography.caption-md}"
    rounded: "{rounded.sm}"
    padding: 4px 8px
  progress-bar:
    track: "{colors.hairline}"
    fill: "{colors.primary}"
    rounded: "{rounded.full}"
    height: 3px | 6px | 8px
  stat-tile:
    backgroundColor: "{colors.surface}"
    border: "1px solid {colors.hairline}"
    rounded: "{rounded.lg}"
    padding: 16px
    valueTypography: "{typography.heading-2}"
  avatar:
    rounded: "{rounded.full}"
    size: 24px | 32px | 56px
    fallbackFill: "{colors.sticker-*}"
  data-table-header:
    typography: "{typography.eyebrow}"
    textColor: "{colors.faint}"
    borderBottom: "1px solid {colors.hairline}"
  data-table-row:
    typography: "{typography.body-sm}"
    borderBottom: "1px solid {colors.hairline-soft}"
    padding: 10px 0
  diff-row:
    rounded: "{rounded.sm}"
    padding: 10px 12px
    markerSize: 24px
    markerFill: "{colors.<tone>-soft}"
---

# Cockpit & Paper

## Overview

Two moods, one system.

**Cockpit (dark, default).** A quiet instrument panel. The canvas is near-black `{colors.canvas}` (#07080a). Surfaces step up in lightness (#0d0d0d → #101111 → #121212 → #18191a) and are outlined by 1px hairlines (#242728). There are no drop shadows. The one action is a white button with black text. Saturated accents appear only when they carry meaning (status, progress, review).

**Paper (light).** A well-organised desk in daylight. The canvas is warm off-white `{colors.canvas}` (#f6f5f4), cards are pure white, text is an ink ramp (#000 → #31302e → #615d59 → #a39e98), and the one action is blue (#0075de). Depth comes from very soft multi-layer shadows.

Both themes share:
- **One family:** Inter with `ss03` always on. JetBrains Mono for every number that changes: times, durations, scores, diffs.
- **One shape language:** tight 4–16px radii, pills only for tabs, avatars and progress tracks.
- **One spacing rhythm:** an 8px base with 2/4/12 half-steps and a 96px section gap.
- **Semantic accents:** blue (info), green (success), yellow/orange (warning), red (danger), each with a soft 10–15% fill.
- **A sticker palette** of purple, sky, pink, orange, teal and green, used only for decoration: category dots, avatar fallbacks, collectible tiles.
- **A signal gradient** (#ff5757 → #a1131a), used at most once per surface for a celebratory or launch moment.

## Fera overrides (win over everything below)

Source: D4 §2, §6.3, §6.4 and §8. Where this section and the rest of this file disagree, this section wins. D4 behaviour rules win over both.

- **Themes by surface.** Parent screens (S-001–S-006) use **Paper** only. Desk screens (staff, officer, admin) default to **Cockpit**, with Paper available.
- **Bangla type.** Bangla text uses **Noto Sans Bengali** (400, 600). The stack is `"Noto Sans Bengali", Inter, system-ui, sans-serif` for Bangla and `Inter, "Noto Sans Bengali", system-ui, sans-serif` for English. Self-host woff2 subsets (`next/font`), use `font-display: swap`, and preload the Bangla subset on parent routes. This is the one allowed second sans family. `ss03` applies to Inter only.
- **Parent body** is 18 px with line-height 1.7, because Bangla conjuncts and matras need room. **Desk body** is 16 px with line-height 1.55 in Bangla mode. Keep Inter's 1.6 for English. The negative heading tracking applies to Latin only; Bangla headings use 0 tracking.
- **Numerals.** Parent screens in Bangla mode use Bangla numerals in Noto Sans Bengali. JetBrains Mono has no Bangla digits, so mono applies to Latin digits only. Officer screens show both where there is space ("১৩ / 13").
- **No red on parent screens.** No `danger` fills, red banners, countdowns, flashing or the signal gradient anywhere on S-001–S-006. Parent errors use a neutral surface with an icon (D4 §8). On desk screens, `danger` stays soft-fill only, as in Buttons below.
- **Status = icon + text + colour**, always. Open = `circle-dot`, Matched = `git-compare`, Closed = `circle-check`, Referral recorded = `hand-heart` plus simulation text. Lucide outline icons, paired with text on every action and status.
- **Honest labels.** Synthetic, `[MOCK]`, cached ("ক্যাশ"), planned and simulation labels use the dashed "not real yet" border and are never hidden.
- **Touch targets** are ≥ 44 px on parent screens. Everything reflows at 320 px and works at 200 % text zoom.
- **Illustration.** Product UI stays illustration-free (Principle 1), except D4's simple flat line drawings of places on parent screens. Never children's faces, photos or silhouettes.
- **Desk shortcuts** (J/K/Enter, C/R, Esc) are switched off while typing, and every one has a visible button equivalent.

### Principles
1. **The UI is the hero.** No illustration or stock imagery inside the product. Show the real interface.
2. **One action per view.** Only one primary button is visible per decision.
3. **Elevation by lightness.** In dark mode, climb the surface ladder instead of adding shadow.
4. **Accents are signals.** Use color only when it means something. Decoration stays in the sticker palette, and only at small sizes.
5. **Numbers are mono.** Tabular figures for anything that ticks, compares or adds up.
6. **Dashed means "not real yet".** Use dashed borders for placeholders, fixed constraints, and things that didn't happen.

## Colors

### Action
| Token | Dark | Light | Use |
|---|---|---|---|
| `primary` | #ffffff | #0075de | Primary button fill, checked controls, active progress fill |
| `primary-pressed` | #e8e8e8 | #005bab | Pressed state |
| `on-primary` | #000000 | #ffffff | Text/glyphs on primary |
| `link` | #ffffff (500 weight) | #0075de | Inline links; underline on hover |
| `focus-ring` | #57c1ff | #0075de | `:focus-visible` ring |

### Surfaces
| Token | Dark | Light | Use |
|---|---|---|---|
| `canvas` | #07080a | #f6f5f4 | Page background |
| `surface` | #0d0d0d | #ffffff | Cards, panels, sidebar contents |
| `surface-elevated` | #101111 | #ffffff | Inputs, tertiary buttons, lifted cards, toasts |
| `surface-card` | #121212 | #f6f5f4 | Icon tiles, wells inside cards, hover |
| `surface-deep` | #18191a | #f6f5f4 | Dialog footers, active segment, tooltip |
| `hairline` | #242728 | #e6e6e6 | Every 1px border and divider |
| `hairline-soft` | white 8% | black 6% | Row separators inside a card |
| `hairline-strong` | white 16% | #dddddd | Focused input, live item, popovers, outlined button |
| `scrim` | black 64% | #0f0f0f 40% | Modal backdrop (no blur) |

### Text
| Token | Dark | Light | Use |
|---|---|---|---|
| `ink` | #f4f4f6 | #000000 | Headings, primary labels, values |
| `body` | #cdcdcd | #31302e | Running text |
| `mute` | #9c9c9d | #615d59 | Secondary text, descriptions, inactive icons |
| `faint` | #6a6b6c | #a39e98 | Meta, timestamps, placeholders, table headers |
| `disabled` | #434345 | #a39e98 | Disabled labels |

### Semantic
Each tone has three values: `<tone>` (dot, icon, border, fill), `<tone>-soft` (badge and selection background), and `<tone>-text` (text on the soft fill, darkened in light mode for 4.5:1 contrast).

| Tone | Dark | Light | Meaning |
|---|---|---|---|
| info | #57c1ff | #0075de | In progress, informational, selected data |
| success | #59d499 | #1aae39 | Done, positive delta, additions |
| warning | #ffc533 | #dd5b00 | Partial, needs attention, reductions |
| danger | #ff6161 | oklch(58% .2 25) | Missed, destructive, removals |

### Sticker palette (decoration only)
purple #d6b6f6 · sky #62aef0 · pink #ff64c8 · orange #dd5b00 · teal #2a9d99 · green #1aae39 · brown #523410 · purple-deep #391c57 · orange-deep #793400.
Use for: category dots (7px), avatar fallbacks, collectible/achievement tiles, chart series beyond the semantic four. **Never** use for a button, structural surface, or text block.

### Signal gradient
`linear-gradient(135deg, #ff5757, #a1131a)`. Use it as diagonal stripes or a progress fill for one celebratory or launch moment per surface. Never as a page background.

## Typography

### Families
- **Inter**, fallback `-apple-system, system-ui, "Segoe UI", Helvetica, Arial, sans-serif`. Always set `font-feature-settings: "calt","kern","liga","ss03"`; ss03 is part of the voice.
- **JetBrains Mono**, fallback `ui-monospace, SFMono-Regular, Menlo`. Tabular. For times (`16:00–16:45`), durations (`45m`), scores, deltas (`+6`, `×1.55`), diffs and counts in nav.

### Hierarchy
| Token | Size / Weight | LH | Tracking | Use |
|---|---|---|---|---|
| display-1 | 64 / 700 | 1.0 | −2.125px | Marketing hero only |
| display-2 | 54 / 700 | 1.04 | −1.875px | Marketing section heads |
| heading-1 | 40 / 700 | 1.1 | −1px | Page titles, interstitial headlines |
| heading-2 | 26 / 700 | 1.23 | −0.625px | Big stat values, focus-stage titles |
| heading-3 | 22 / 700 | 1.27 | −0.25px | Hero card titles |
| title | 20 / 600 | 1.4 | −0.125px | Sub-section titles |
| heading-sm | 18 / 500 | 1.4 | +0.2px | Card and dialog titles |
| body-lg | 18 / 400 | 1.6 | 0 | Lead paragraphs |
| body-md | 16 / 400 | 1.6 | 0 | Default text, inputs |
| body-strong | 16 / 500 | 1.4 | +0.2px | Emphasised labels, lg buttons |
| body-sm | 14 / 400 | 1.6 | 0 | Dense UI text, nav, table cells |
| body-sm-strong | 14 / 500 | 1.6 | +0.2px | Item titles, form labels |
| button | 14 / 500 | 1.6 | +0.2px | md buttons |
| caption-md | 13 / 400 | 1.4 | +0.1px | Meta lines, descriptions, sm buttons |
| caption-sm | 12 / 400 | 1.5 | +0.4px | Badges, chart labels |
| eyebrow | 12 / 600 UPPER | 1.33 | +0.125px | Section labels, table headers |
| mono-display | 64–112 / 500 | 1.0 | −2 to −5px | Timers, hero numbers |
| mono-md / mono-sm | 13/500 · 12/400 | 1.4 | 0 | Inline data |

### Principles
- Headings are heavy and tight: the bigger the size, the more negative the tracking. Body and UI text is airy (1.6 line height) with slightly open tracking.
- Sentence case everywhere. Eyebrows are the only uppercase text.
- `text-wrap: pretty` on paragraphs, `balance` on short centered headlines.
- Minimum: 12px for meta, 14px for interactive labels.

## Layout

- **Spacing:** 2 · 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · 96. Card padding 16–24px (never 32+). Gaps between cards 12–16px. Section rhythm on marketing pages is 96px.
- **App shell:** 240px left sidebar on `canvas` with a hairline right border. The content area scrolls. An optional 360px right rail is sticky at `top: 20px`.
- **Page header:** 28px top / 32px side / 20px bottom padding. Eyebrow above a heading-1. Page actions are right-aligned on the title baseline.
- **Content max:** 1240px; text-heavy columns 720px.
- **Grids:** `repeat(auto-fit, minmax(200px, 1fr))` for stat tiles; `minmax(0, 1fr)` tracks so text never overflows.
- **Responsive:** rails wrap below the main column under ~900px; the sidebar collapses to icons under ~720px. Controls keep 36px height (44px on touch).
- **Lists inside cards:** rows separated by `hairline-soft`, 10–12px vertical padding, no zebra striping.

## Elevation & Depth

| Level | Dark | Light | Use |
|---|---|---|---|
| 0 | `canvas` | `canvas` | Page |
| 1 | `surface` + hairline | `surface` + hairline | Cards, lists |
| 2 | `surface-elevated` + hairline-strong | `surface` + shadow-1 | Hero card, live item, stat tiles, inputs |
| 3 | `surface` + hairline-strong | `surface` + shadow-2 | Toasts, dialogs, popovers |
| Scrim | black 64% | #0f0f0f 40% | Behind modals |

No glass, no blur, no glow. Dark mode never uses shadow; light mode never uses shadows heavier than `shadow-2`.

## Shapes

| Token | Value | Use |
|---|---|---|
| xs | 4px | Keycaps, badges, checkboxes |
| sm | 6px | Command/list rows, segmented options, tooltips, diff markers |
| md | 8px | Buttons, inputs, icon buttons, icon tiles |
| lg | 10px | Cards, list containers, toasts, scheduled items |
| xl | 16px | Dialogs, hero cards, full-screen stages |
| full | 9999px | Pill tabs, avatars, progress tracks, switches |

Borders are always 1px. Dashed 1px means placeholder, fixed constraint, or missed/not-happened.

## Motion

- Hover and color changes: 120ms `ease-out`. Toggles and switches: 200ms. Progress fills: 360ms.
- Easing `cubic-bezier(0.2, 0.8, 0.2, 1)`. No springs, bounces or parallax.
- Press: `scale(0.97)` + pressed color.
- Toasts enter with a 200ms 8px rise + fade. Modals fade the scrim and scale the panel from 0.98.
- `prefers-reduced-motion`: all durations → 0.

## Components

Every component reads semantic tokens, so it re-themes automatically under `[data-theme="light"]`.

### Buttons
- **Primary:** `primary` fill, `on-primary` text, 36px, radius md, 0 16px padding. Hover → 92% opacity; press → `primary-pressed` + scale. **One per view.**
- **Tertiary:** `surface-elevated` (light: black 5%) + hairline. The default for secondary actions.
- **Secondary:** transparent + `hairline-strong` outline.
- **Ghost:** text only, `body` color, hover adds `surface-hover`.
- **Danger:** `danger-soft` fill, `danger-text` label. Never a solid red fill.
- **Sizes:** sm 28px (caption-md, 10px padding) · md 36px · lg 44px (body-strong, 20px padding; touch and hero).
- **Optional trailing keycap** shows the shortcut (`Accept ⏎`).
- **Icon button:** square 28/36/44, `mute` glyph that becomes `ink` on hover/active.

### Keycap
20px tall, radius xs, vertical gradient `keycap-start → keycap-end`, hairline border, caption-md. Inside a primary button: black 8% fill, inherits text color. Use for every shortcut hint (⌘ K ⏎ Esc).

### Badges
20px, radius xs, caption-sm/500. Neutral = `surface-elevated` + hairline + `mute`. Semantic = `<tone>-soft` + `<tone>-text`, optional 6px dot or 12px icon.

### Forms
- **Text input:** `surface-elevated`, hairline, radius md, 36px (lg 44px for search/capture bars). Focus brightens the border to `hairline-strong` (light: also shadow-1). An error turns the border `danger` and shows a caption-md message in `danger-text`.
- **Label:** body-sm-strong in `ink`, 6px above. Hint: caption-md in `mute`, 6px below.
- **Textarea:** same as input, 10px vertical padding, no resize handle.
- **Checkbox:** 16px, radius xs, `hairline-strong` border; checked = `primary` fill + 12px check (3px stroke).
- **Switch:** 32×18 pill; off `hairline-strong`, on `primary`; 14px knob.
- **Segmented control:** 2–4 options, `surface-elevated` track with 2px inset; the active option lifts to `surface-deep` (light: white + shadow-1) with `hairline-strong`.
- **Select:** native select styled as an input with a 14px chevron at the right.
- **Slider:** 4px track; filled portion `primary`; mono value top-right; optional caption-sm marks below.

### Navigation
- **Nav item:** 32px row, radius sm, 16px icon in `mute`, body-sm label. Active = `surface-selected` + `ink` + body-sm-strong. Optional mono count right-aligned in `faint`.
- **Pill tabs:** body-sm, 4px 10px, radius full; active = `surface-selected` + hairline + `ink`. Optional mono count.

### Containers
- **Card:** `surface`, hairline, radius lg, 16–24px padding. Interactive cards get `surface-hover` on hover.
- **Elevated card:** `surface-elevated`, `hairline-strong`, radius xl, shadow-1 (light). Use for the single most important card on a screen.
- **Well:** `surface-card` + hairline + radius md, 10px 12px padding, for a highlighted line inside a card.
- **Icon tile:** 24–32px square, `surface-card` + hairline, radius sm/md, 14–16px icon.
- **Never** use colored left-border accent stripes on cards. Show state with an icon plus a badge.

### Command palette
Container card with 6px padding. Rows are 6px 10px, radius sm, 24px icon tile, body-sm label in `ink`, hint in `faint`, keycaps right. Active/hover = `surface-selected`.

### Feedback
- **Toast:** 360px, `surface-elevated`, `hairline-strong`, radius lg, shadow-2. 32px tinted icon tile (`<tone>-soft` + `<tone>`), body-sm-strong title, caption-md body in `mute`, optional meta (caption-sm `faint`) and a row of sm buttons. Stack bottom-right, max 3.
- **Dialog:** radius xl, `hairline-strong`, shadow-2. Header: optional 32px icon tile + heading-sm title + body-sm description. Body padding 20px. Footer on `surface-deep` with a hairline top, actions right-aligned (ghost, then primary).
- **Tooltip:** `surface-deep`, `hairline-strong`, radius sm, caption-md, optional keycap.
- **Progress bar:** radius full; heights 3/6/8; track `hairline`; fill `primary` or a semantic tone; optional caption-md label + mono value above.

### Data display
- **Stat tile:** card padding 16, caption-md label with 14px icon, heading-2 value with `tnum`, optional unit (body-sm `mute`) and mono delta right-aligned in `<tone>-text`. Optional sparkline or progress slot.
- **Table:** eyebrow headers in `faint` over a hairline; rows body-sm with a `hairline-soft` divider; numeric columns right-aligned mono.
- **Heatmap:** 3px gaps, radius 3, single hue (`info`) with opacity 0.08–1.0. Never rainbow scales.
- **Avatar:** circle; image or initials (600, 38% of size, black) on a sticker fill picked by name hash. Status dot: 28% size, 2px `canvas` ring.

### Agentic patterns
- **Diff review:** a card listing proposed changes. Each row has a 24px marker tile (add = success, move = info, shrink = warning, drop = danger, keep = neutral lock), a body-sm-strong title, `from → to` in mono (old value struck through in `faint`), and a one-line reason in caption-md `mute`. Each row can be rejected individually. The footer reads "Every change can be undone", with Edit (ghost), Reject (tertiary) and Accept n/m (primary + ⏎).
- **Agent never acts silently:** any automated change produces a toast with Undo.

## Iconography
- **Lucide**, 2px stroke, round caps and joins, `currentColor`. Sizes 14 (sm controls) / 16 (default) / 20 (nav, tiles).
- Icons sit in `mute` by default and turn `ink` when active or hovered, or take a semantic tone when they carry state.
- No emoji, no icon fonts, no filled or duotone icons. Unicode only for keycap glyphs (⌘ ⇧ ⏎ ⌥) and mono data arrows (→ ×).

## Content & voice (defaults)
- Second person, calm, concrete. Sentence case. Buttons are verbs ("Start", "Accept", "Keep my plan").
- Tell people what to do next instead of what they did wrong.
- Numbers are specific and mono (`45m → 70m`, `+6`, `4/5`).
- No exclamation marks in UI chrome. No emoji.

## Theming & implementation
- Ship dark as `:root` and light as `[data-theme="light"]` on `<html>` or on any subtree, so themes can be mixed for previews.
- Components consume **semantic** variables only (`--bg-surface`, `--text-strong`, `--action-bg`, `--border`, `--info-soft`…), never raw hex.
- Suggested CSS variable map: `canvas → --bg-canvas`, `surface → --bg-surface`, `surface-elevated → --bg-elevated`, `surface-card → --bg-card`, `surface-deep → --bg-raised / --bg-deep`, `hairline → --border`, `hairline-soft → --border-subtle`, `hairline-strong → --border-strong`, `ink/body/mute/faint/disabled → --text-strong/-body/-muted/-faint/-disabled`, `primary → --action-bg`, `on-primary → --action-fg`.
- Fonts: Inter (400–700), JetBrains Mono (400–600) and Noto Sans Bengali (400, 600), self-hosted through `next/font`. The finale must run offline, so don't depend on a fonts CDN at runtime.

## Accessibility
- Text contrast ≥ 4.5:1 (3:1 only for heading-scale type). `<tone>-text` exists so badge labels pass in light mode.
- Every interactive element gets a `:focus-visible` ring (2px canvas gap + 2px `focus-ring`).
- Hit targets: 28px minimum on desktop, 44px on touch.
- State is never color-only. Pair it with an icon, label or dashed/solid border.

## Do's and Don'ts

### Do
- Keep one primary action per view; make the rest tertiary or ghost.
- Build dark-mode depth from the surface ladder and hairlines.
- Put every time, duration, score and delta in tabular mono.
- Keep sticker colors small: dots, avatar fills, collectible tiles.
- Use dashed borders for "not real yet" and solid for "real".
- Keep card padding at 16–24px and radii at 10px (cards) / 8px (controls).

### Don't
- Don't use drop shadows in dark mode, or shadows heavier than `shadow-2` in light mode.
- Don't fill buttons or surfaces with sticker or semantic colors (semantic soft fills on badges and selections are fine).
- Don't use the signal gradient more than once per surface, or as a background.
- Don't add colored left-border accents to cards, rainbow charts, glassmorphism, or gradient page backgrounds.
- Don't use emoji, icon fonts, or illustration inside product UI.
- Don't turn off `ss03`, or mix in a second sans family other than Noto Sans Bengali for Bangla text.

## Provenance
- **Dark mode:** surface ladder, hairlines, white action, keycap, radii, spacing, UI type rhythm and semantic accents come from an analysis of Raycast's design language.
- **Light mode:** warm canvas, ink ramp, blue action, micro-shadows, display/heading ladder and sticker palette come from an analysis of Notion's design language.
- **Deliberate deviations:** semantic accents are allowed in product chrome to carry state; card radius is 10px rather than 12px; JetBrains Mono is added for data.
