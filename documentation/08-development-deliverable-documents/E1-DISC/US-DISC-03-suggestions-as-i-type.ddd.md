---
title: DDD — US-DISC-03 — Suggestions as I type
updated: 2026-09-04
---

# US-DISC-03 — Suggestions as I type

**Epic:** Discover who's available (DISC) — `user-stories.md` §4
**Priority:** M

## 1. Story

As a seeker, I want instant suggestions while typing, so that search feels fast and I discover what I can ask for.

## 2. Acceptance criteria

- Suggestions render ≤ 200 ms after keystroke (server ≤ 100 ms, SR-PERF-02), covering service terms, areas, and recognized intents.
- Given an anonymous user types a person's name, then suggestions never surface individual provider names — discovery is by service, not people-lookup (FR-SRCH-07).

## 3. Traces

FR-SRCH-07, SR-PERF-02.

## 4. Build blueprint

**Primary LLD module:** `discovery-search` (`../../05-low-level-design/04-discovery-search/discovery-search-lld.md`)

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
- `07-test-artifacts/04-traceability-matrix.md` row for US-DISC-03 cross-references this DDD (applied in the stage-9 traceability pass).
- No application code exists yet for this story; this document is the blueprint an implementer builds from, not the implementation.

## 7. Implementation Notes

### Session 2026-09-05 — feat/initial-implementation — Cursor Composer (US-DISC-03)

**Approach:** Extended `runSuggest` to LLD §8 trigram + prefix ordering with `toSuggestions()` serializer. Added `SearchBar.svelte` (pill search bar, debounced `/api/discovery/suggest` fetch, skeleton loading panel, combobox a11y, kind labels) wired into homepage `+page.svelte`. Fixed CSP hydration blocker: moved `script-src` hashes to `svelte.config.js` `csp.mode = 'hash'` and stopped hooks from overwriting SvelteKit's CSP header (client interactivity required for typeahead).

**Tests:** `serializers.test.ts`, `suggest-kind-label.test.ts`, `suggest.integration.test.ts` (TC-DISC-03a/b + fuzzy/blank), `testing/playwright/search-suggestions.e2e.ts` (5/5 + axe).

**Verified:** `npm run check`, `npm run lint`, `npm run test`, `npm run test:integration`, `npm run boundaries`, `npm run build`, `npx playwright test e2e/search-suggestions.e2e.ts`.
