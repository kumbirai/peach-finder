---
title: DDD — US-DISC-05 — "Near me" without giving up my privacy
updated: 2026-09-04
---

# US-DISC-05 — "Near me" without giving up my privacy

**Epic:** Discover who's available (DISC) — `user-stories.md` §4
**Priority:** M

## 1. Story

As a seeker, I want proximity search using my device location (or a typed area if I decline), so that results are actually reachable.

## 2. Acceptance criteria

- "Near me" triggers the browser permission prompt; on denial, a manual area entry is offered inline — proximity still works, degraded gracefully.
- Distance is computed and displayed to the provider's stated *area*, never an exact address.
- My device coordinates are used for the request only and never stored server-side (FR-PRIV-02).

## 3. Traces

FR-SRCH-06, FR-PROF-04, FR-PRIV-02, SR-INT-06.

## 4. Build blueprint

**Primary LLD module:** `discovery-search` (`../../05-low-level-design/04-discovery-search/discovery-search-lld.md`)
**Supporting modules:** `provider-profile` (`../../05-low-level-design/02-provider-profile/provider-profile-lld.md`)

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
- `07-test-artifacts/04-traceability-matrix.md` row for US-DISC-05 cross-references this DDD (applied in the stage-9 traceability pass).
- No application code exists yet for this story; this document is the blueprint an implementer builds from, not the implementation.

## 7. Implementation Notes

### Session 2026-09-05 — feat/initial-implementation — Cursor

**Approach:** Backend search already computed haversine `distance_km` when `lat`/`lng` were passed transiently. This story added `resolveSearchCoords` (device coords or `area` slug → centroid via `platform-configuration.getActiveAreaBySlug`), `proximityLabel` in search results, and wired the discover homepage with `NearMeControl` (geolocation prompt, inline manual area entry on denial using area suggestions, location row per prototype). Distance displays on `ProviderCard` via `formatDistanceKm`. Coordinates are request-scoped only — never written to storage (FR-PRIV-02).

**Files touched:**
- `src/lib/server/modules/platform-configuration/index.ts` — `getActiveAreaBySlug`
- `src/lib/server/modules/discovery-search/app/resolve-search-coords.ts`, `search.ts`
- `src/routes/+page.server.ts`, `src/routes/api/discovery/search/+server.ts`
- `src/lib/search-url.ts` (+ test), `src/lib/format-distance.ts` (+ test)
- `src/lib/components/NearMeControl.svelte`, `src/routes/+page.svelte`, `src/lib/components/ProviderCard.svelte`
- `src/lib/server/modules/discovery-search/near-me-search.integration.test.ts`
- `testing/playwright/search-near-me.e2e.ts`

**Assumption:** Manual area fallback passes the suggest-term slug (`area` URL param) rather than free-text geocoding — consistent with SR-INT-06 (owned gazetteer, no paid geocoding API on the hot path).

**Verification:** `npm run check` and `npm run lint` clean. Unit + integration tests green (128/128). Playwright `testing/playwright/search-near-me.e2e.ts` — 4/4 passed against live-seeded stack (Postgres via docker compose). E2e uses `scrollIntoViewIfNeeded` before clicking the Near me control (sticky header overlap) and init-script geolocation grant/deny hooks for deterministic browser permission simulation.

**Session 2026-09-05 (lint pass):** Removed unused `near`/`lat`/`lng`/`areaSlug` props from `NearMeControl` — proximity UI state is driven solely by server-resolved `proximityLabel` (prevents false active state for unresolved area slugs and satisfies `svelte/no-unused-props`).

**Session 2026-09-05 (review pass 2):** Hid unresolved `near` intent chip when `proximityLabel` is null; orphan-proximity Clear uses server-derived `clearProximityHref` link (SvelteKit reliably strips stale query params). Distinguished geolocation-unavailable vs denied manual-fallback copy. Playwright TC-DISC-05d/e regressions added.

**Follow-ups:** None for this story.
