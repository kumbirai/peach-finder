---
title: DDD — US-ANLY-01 — My four numbers
updated: 2026-09-04
---

# US-ANLY-01 — My four numbers

**Epic:** Understand how I'm found (ANLY) — `user-stories.md` §13
**Priority:** M

## 1. Story

As a provider, I want profile views, search appearances, contact requests, and most-searched services — each with a current total, a trend, and a prior-period comparison over 7/30/90-day ranges — so that I can see whether listing is working.

## 2. Acceptance criteria

- Exactly the BR-17 metric set; default range 30 days; metric definitions displayed in-product (view = deduped per viewer per day; appearance = card rendered in a viewed result set; contact = new thread + tap-to-call taps where enabled).

## 3. Traces

FR-ANLY-01, FR-ANLY-02.

## 4. Build blueprint

**Primary LLD module:** `provider-analytics` (`../../05-low-level-design/10-provider-analytics/provider-analytics-lld.md`)

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
- `07-test-artifacts/04-traceability-matrix.md` row for US-ANLY-01 cross-references this DDD (applied in the stage-9 traceability pass).
- No application code exists yet for this story; this document is the blueprint an implementer builds from, not the implementation.

## 7. Implementation Notes

**Approach:** Implemented the full `provider-analytics` module per LLD §3–§10: migration `0025_us_anly_01_my_four_numbers.sql` (raw events, hourly rollups, dashboard cache); fire-and-forget capture facades (`captureView`, `captureAppearance`, `captureFilterUsage`, `captureContactRequest`, `captureTapToCall`); `ThreadCreated` subscription wired in the worker; hourly rollup + 90-day raw purge tick; `GET /api/analytics/dashboard` and `POST /api/analytics/tap`; provider dashboard “Your reach” section via `ProviderAnalyticsSection.svelte` with 7/30/90 range selector, sparkline trends, prior-period comparison, in-product FR-ANLY-02 definitions, and most-searched service; capture wired from profile SSR load and homepage search SSR load.

**Deviation:** `ANALYTICS_VIEWER_KEY_SALT` is optional — falls back to `DATABASE_URL` in dev/test when unset (recorded for ops to set in production). Tap capture uses inline fire-and-forget insert (not a separate pg-boss queue) to avoid an extra worker queue for a single-row write; API still returns 202 per contract.

**Follow-ups:** US-ANLY-04 chart event annotations; US-PRIV-03d raw-event purge integration test at 90-day boundary; consider dedicated `ANALYTICS_VIEWER_KEY_SALT` in deployment secrets.
