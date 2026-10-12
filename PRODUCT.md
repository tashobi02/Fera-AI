# Product

<!-- impeccable:product-schema 1 -->
<!-- Drafted from the Fera V2 spec pack (docs/spec/) on 2026-10-12. Not yet confirmed by the team: run `/impeccable init` once to confirm or correct each section. -->

## Platform

adaptive

## Stack

Next.js App Router, TypeScript strict, Tailwind, PostgreSQL 16 + pgvector. Parent surfaces are mobile web (Android Chrome, 360 px first); staff, officer and admin surfaces are desktop/laptop web that must still reflow to 320 px.

## Users

- **Parent or guardian** reporting a missing child in the first hours, often frightened, on a mid-range Android phone, more comfortable speaking Bangla than typing. No account.
- **Station or shelter staff/volunteer** logging a found child in under two minutes at a railway station, launch terminal or shelter desk.
- **Verified officer** reviewing ranked candidates on a laptop, comparing evidence side by side, recording decisions and closures.
- **Admin** verifying officer accounts (mock), redacting closed records, importing invented fixtures. Never sees child details.
- Hackathon judges and mentors watching a live demo (Round 2 video, finale 24 Oct 2026).

## Product Purpose

Turn a parent's Bangla voice or text into a reviewed, structured missing report with a GD draft and a no-photo poster; let staff log found children; surface likely missing ↔ found candidates nationally with evidence; and let a verified officer record a decision that ends in a known coordination status and honest district counts. Success: one synthetic report reaches a recorded decision and closure, with every safeguarding rule visible on screen.

## Positioning

A coordination layer around existing processes, not a replacement: Fera drafts the GD the parent files themselves, complements CID's MUN Alert without issuing alerts, and keeps every decision with a person. It is a synthetic-data prototype; no partnership, integration or legal compliance is claimed.

## Operating Context

Parents use it in distress, outdoors, on patchy mobile data; staff use shared desk PCs or phones under time pressure; officers work through a queue on a laptop with keyboard shortcuts. The finale demo may run on a laptop with venue internet down, so the essential journey must work from a local stack with cached, clearly labelled AI outputs.

## Capabilities and Constraints

- Bangla-first with an English toggle on every screen; Bangla numerals on parent screens in Bangla mode.
- Voice 5–120 s with an editable transcript; text 20–2,000 characters; at most four one-at-a-time follow-up questions, then a manual form.
- Every extracted field is reviewed and editable before submit; unknown stays unknown.
- Candidate similarity is shown as similarity with "not proof of identity"; zero candidates is valid.
- Confirm is a two-step dialog that records a decision and a *simulated* referral — never a return of the child.
- No photos, faces, ID documents or exact coordinates. All data synthetic and labelled.
- Counts separate missing reports, found reports and confirmed pairs.

## Brand Commitments

Calm, precise, accountable. For parents: quiet, warm, one thing at a time, no alarm colours, no urgency theatre. For officers: dense, fast, keyboard-first, evidence before opinion. Copy never promises rescue, never labels a child a runaway, never claims alerts, police integration or legal compliance. Honest labels — synthetic, cached, simulation, `[MOCK]`, planned — are part of the brand, shown with dashed borders ("not real yet").

## Evidence on Hand

- V2 spec pack in `docs/spec/` (PRD, TRD, app flow, design brief, schema, plan, closing pack).
- Visual system in `DESIGN.md` (Cockpit & Paper: dark Cockpit for desks, light Paper for the parent phone).
- Clickable prototype of all 16 screens: https://claude.ai/artifact/NiRLbAAYfY8eyPSpWMZmH4
- No user interviews held yet (0); no measured metrics yet — show "not measured" until the frozen evaluation runs.

## Product Principles

1. People decide; AI retrieves and ranks.
2. Review before anything leaves the device.
3. Least visibility by role.
4. Honest by construction — label what is simulated, cached or synthetic.
5. One clear next step per screen.

## Accessibility & Inclusion

WCAG 2.2 AA. Status always icon + text + colour. Targets ≥ 44 px on parent screens; parent body text 18 px, line height 1.7 for Bangla conjuncts. Keyboard-complete officer flows with visible focus. 320 px reflow, 200 % text zoom. Typed path always available as an alternative to voice. Respect reduced motion.
