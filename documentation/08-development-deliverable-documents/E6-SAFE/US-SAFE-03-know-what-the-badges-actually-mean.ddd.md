---
title: DDD — US-SAFE-03 — Know what the badges actually mean
updated: 2026-09-04
---

# US-SAFE-03 — Know what the badges actually mean

**Epic:** Stay safe: report & block (SAFE) — `user-stories.md` §9
**Priority:** S

## 1. Story

As a seeker, I want a concise safety page — what badges do and don't verify, incall meeting-safety basics, how to report — linked from every profile's badge area and the footer, so that trust is calibrated, not assumed.

## 2. Acceptance criteria

No dedicated acceptance-criteria list in `user-stories.md` §9 for this story — behavior is fully specified by the story statement above and the traces below.

## 3. Traces

FR-TRUST-09.

## 4. Build blueprint

**Primary LLD module:** `trust-and-safety` (`../../05-low-level-design/07-trust-and-safety/trust-and-safety-lld.md`)

Implement against that module's data model (§3 of its LLD doc), API contract, and domain-events sections; do not re-derive data shapes here — the LLD is the single source of truth for schema and contracts. Build tasks:

- [x] Backend: implement/extend the endpoint(s) and event publishers/subscribers this story requires, per the primary module's API-contract and domain-events sections.
- [x] Frontend: implement the surface(s) this story is user-visible on on the SvelteKit client, matching the interactive prototype (`06-ui-ux-design/prototypes/seeker-and-provider-prototype.html`) pixel-for-pixel on tokens and in spirit on interaction.
- [x] Tests: runnable Playwright spec(s) authored from the relevant `07-test-artifacts/05-playwright-spec-designs/*.spec-design.md` file(s) and the story-level test cases in `07-test-artifacts/03-test-cases/`; unit/integration coverage per `05-low-level-design/14-test-strategy/test-strategy.md`'s module-by-module matrix.

## 5. Visual & UX acceptance (mission-driven)

This delivery's driving mission is a top-10-app bar on visual look, premium feel, and flawless usability (see `00-foundations/frontend-design-system-implementation.ddd.md`). Every surface this story touches must satisfy, at minimum:

- **Token conformance** — only Terracotta Deep (`#B34625`, action/availability) and Verified Pine (`#2F5D50`, trust/verification) carry meaning (Two-Hue Rule, `DESIGN.md` §2); no status is color-only (Never-Color-Alone Rule); shadows tint toward Terracotta/Ink, never neutral gray (Warm Shadow Rule, `DESIGN.md` §4); Fraunces appears only at Display/Headline scale (One-Serif Rule, `DESIGN.md` §3); interactive controls are full-pill (999px) per `DESIGN.md` §5, with the documented exceptions (inputs 14px, cards 20px/14px nested).
- **Accessibility** — WCAG 2.2 AA (4.5:1 text / 3:1 UI), ≥44px touch targets at 360px, a visible Terracotta focus ring on every focusable element (never a bare browser outline, never `outline: none` with nothing replacing it), and `prefers-reduced-motion` respected wherever this story's surface animates (`PRODUCT.md` Accessibility & Inclusion; `DESIGN.md` §5 Signature Component).
- **Perceived performance** — skeleton/optimistic states on the loading path, never a bare spinner (FR-UX-05); no visible layout shift as photography/content resolves; server-rendered meaningful content pre-hydration where this surface is a first-load entry point (FR-UX-08).
- **Release gate** — enforced by `07-test-artifacts/05-playwright-spec-designs/e2e-visual-quality-design-system.spec-design.md` and, where this story affects a measured budget, `e2e-performance-and-perceived-quality.spec-design.md`. Both are live-stack-seeded designs (`stub_mode: forbidden`); the runnable `.spec.ts` is written at implementation time against this DDD.

## 6. Definition of Done

- All acceptance criteria in section 2 verified against the live-seeded stack (`seed-core` or the relevant seed pack) — no stubbed HTTP, no `page.route` interception, per this project's live-stack-seeded testing convention.
- Visual regression baseline captured/approved for every surface this story adds or changes; token-conformance and accessibility assertions above pass.
- `07-test-artifacts/04-traceability-matrix.md` row for US-SAFE-03 cross-references this DDD (applied in the stage-9 traceability pass).
- No application code exists yet for this story; this document is the blueprint an implementer builds from, not the implementation.

## 7. Implementation Notes

### Session 2026-09-05 — feat/initial-implementation — Cursor Composer (US-SAFE-03)

- **Backend:** No new work — `GET /api/trust/safety-info` and `getSafetyInfo()` were delivered in US-VIEW-04 (reads `platform-configuration.safety_info_html`; anonymous, `search_query` rate limit per LLD §10.1). No events required for this read-only surface.
- **Frontend:** Added site-wide `SiteFooter.svelte` with a link to `/safety` (`SAFETY_FOOTER_LABEL` in `src/lib/trust-badges.ts`), wired through root `+layout.svelte`. Safety page (`/safety`), badge-area links, and one-line explanations were already delivered in US-VIEW-04; this story completes FR-TRUST-09's footer clause.
- **Tests:** `safety-info.e2e.ts` (TC-SAFE-03a: badge area + footer → same safety page with badge meanings, incall guidance, and reporting copy; axe); extended `trust-badges.test.ts` for footer label constant. Existing `safety-info.integration.test.ts` and `profile-badges.e2e.ts` (US-VIEW-04) cover API and badge-area behaviour.

### Verification 2026-09-05

- `npm run check` — 0 errors.
- `npm run lint` — clean.
- `npm run test` — 225/225 passed.
- `npm run test:e2e -- safety-info.e2e.ts` — 2/2 passed (axe clean on safety page).
