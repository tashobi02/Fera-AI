# Cached scenario date disclosure

Puku implemented a shared bilingual notice on cached intake, review and manual fallback surfaces. It preserves the exact D4 cached badge, fixed scripted dates, source spans and all confirmation gates. Live drafts do not show the notice. No DTO, API, contract or fixture dates changed.

Puku reached its request quota before writing its final evidence note. The coordinator independently ran `npx vitest run tests/intake-ui/cached-clock-notice.test.ts`: exit0,18/18 PASS on18Oct2026. Tests cover cached/live visibility, retained device state and the unchanged unchecked confirmation gate. Full integration checks and routed reviews follow on pre-main. Human Bangla review remains pending; no approval is invented.
