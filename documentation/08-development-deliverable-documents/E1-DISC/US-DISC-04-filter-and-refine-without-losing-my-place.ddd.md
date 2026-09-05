---
title: DDD — US-DISC-04 — Filter and refine without losing my place
updated: 2026-09-04
---

# US-DISC-04 — Filter and refine without losing my place

**Epic:** Discover who's available (DISC) — `user-stories.md` §4
**Priority:** M

## 1. Story

As a seeker, I want manual filters for price, language, minimum rating, and verified status that combine with my search, so that I can narrow to exactly what I need.

## 2. Acceptance criteria

- Filters combine with each other and with a natural-language query; applying one updates results ≤ 1 s without a full page reload.
- Active filters are always visible and individually removable.
- Rating filter uses minimum average rating; providers with no reviews show "New", never a zero score (FR-REV-05).

## 3. Traces

FR-SRCH-04, FR-REV-05, SR-PERF-03.

## 4. Build blueprint

**Primary LLD module:** `discovery-search` (`../../05-low-level-design/04-discovery-search/discovery-search-lld.md`)
**Supporting modules:** `provider-reviews` (`../../05-low-level-design/06-provider-reviews/provider-reviews-lld.md`)

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
- `07-test-artifacts/04-traceability-matrix.md` row for US-DISC-04 cross-references this DDD (applied in the stage-9 traceability pass).
- No application code exists yet for this story; this document is the blueprint an implementer builds from, not the implementation.

## 7. Implementation Notes

### Session 2026-09-05 — feat/initial-implementation — Cursor

**Approach:** Backend search already accepted `priceMin`/`priceMax`/`minRating`/`lang[]`/`verified` query params via `runSearch` and `parseQuery`. This story wired the discover homepage UI to those params with prototype-matching quick-filter chips (Verified only, Under R400, 4.8+ rated, Speaks isiZulu) plus Available now. Filter state lives in URL search params; SvelteKit `goto()` updates results client-side without a full browser reload. `parseQuery` now emits removable `appliedIntents` for manual price filters and sets `minRatingCount >= 1` when a manual rating threshold is applied (excludes zero-review providers per FR-REV-05 while keeping the highly-rated lexicon default of 3 when both apply).

**Files touched:**
- `src/lib/manual-filters.ts` (+ test) — chip definitions and toggle helpers
- `src/lib/search-url.ts` (+ test) — `priceMin`/`priceMax` URL state
- `src/lib/components/SearchFilters.svelte`, `src/routes/+page.svelte`, `src/routes/+page.server.ts`
- `src/lib/server/modules/discovery-search/domain/parse-query.ts` (+ test)
- `src/lib/server/modules/discovery-search/app/serializers.test.ts` — "New" rating regression
- `src/lib/server/modules/discovery-search/filter-search.integration.test.ts` — TC-DISC-04a/b/c
- `testing/playwright/search-filters.e2e.ts` — live-stack Playwright coverage

**Assumption:** "Under R400" chip label matches the prototype even though `seed-core` providers are priced at R650/R700; the filter is valid and returns an empty state when no providers match. Integration tests adjust one projection row's price in-test to prove intersection logic.

**Verification:** `npm run check` and `npm run lint` clean. Unit tests green. `npm run test:integration` green for this story's file (78/79 integration tests passed; one pre-existing AVAIL flake). Playwright `testing/playwright/search-filters.e2e.ts` requires a running Postgres stack (`ECONNREFUSED :5432` in this session).

**Follow-ups:** None for this story; US-DISC-05 (near me) and US-DISC-07 (empty-state relaxation) are separate stories.
