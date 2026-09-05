---
title: DDD — US-DISC-08 — Cards I can shortlist from
updated: 2026-09-04
---

# US-DISC-08 — Cards I can shortlist from

**Epic:** Discover who's available (DISC) — `user-stories.md` §4
**Priority:** S

## 1. Story

As a seeker scanning results, I want large photo-forward cards with the facts that matter, so that I can shortlist without opening every profile.

## 2. Acceptance criteria

- Each card shows: primary photo, name, intro extract, availability state + recency, badges, rating + review count, starting price, languages, distance to area, and a primary contact action.
- Cards are thumb-friendly at 360 px viewport; text over photography stays legible (FR-UX-04).

## 3. Traces

FR-SRCH-11, FR-UX-01, FR-UX-04.

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
- `07-test-artifacts/04-traceability-matrix.md` row for US-DISC-08 cross-references this DDD (applied in the stage-9 traceability pass).
- No application code exists yet for this story; this document is the blueprint an implementer builds from, not the implementation.

## 7. Implementation Notes

### Session 2026-09-05 — feat/initial-implementation — Cursor

**Approach:** Added `intro_extract` to `discovery_search.search_projection` (migration `0011_us_disc_08_card_intro.sql`), populated on projection upsert via `formatIntroExtract` and surfaced through `runSearch`/`toSearchCard` together with `language_codes` → display labels and a gated `messageHref` (direct compose for signed-in seekers, `gatedActionHref` for anonymous). Rebuilt `ProviderCard.svelte` to match the prototype card layout: photo scrim for legibility, availability/unavailable pills, intro extract, trust badges, language tags, meta row (distance/area, reviews, price), and full-width Message CTA without nesting interactive elements inside the profile link.

**Files touched:**
- `drizzle/migrations/0011_us_disc_08_card_intro.sql`
- `src/lib/server/modules/discovery-search/domain/intro-extract.ts`, `language-labels.ts` (+ tests)
- `src/lib/server/modules/discovery-search/infra/schema.ts`, `projection-upsert.ts`
- `src/lib/server/modules/discovery-search/app/search.ts`, `serializers.ts` (+ tests)
- `src/lib/server/modules/discovery-search/shortlist-cards.integration.test.ts`
- `src/lib/types/discovery.ts`
- `src/lib/components/ProviderCard.svelte`
- `scripts/seed-core.ts`
- `testing/playwright/search-shortlist-cards.e2e.ts`
- `testing/playwright/*.e2e.ts` — selector `a.card` → `article.card` (card is no longer a single anchor)

**Assumption:** Language display labels use a static ISO-code map in `discovery-search/domain/language-labels.ts` aligned with `provider_profile.language` seed names (e.g. `zu` → `isiZulu`); projection refresh remains authoritative for codes.

**Verification:** `npm run check` and `npm run lint` clean. `npx vitest run src/lib/server/modules/discovery-search` — 29/29 passed; `shortlist-cards.integration.test.ts` — 3/3 passed. Playwright `testing/playwright/search-shortlist-cards.e2e.ts` — 5/5 passed against live-seeded stack (dev server + `seed-core`).

**Follow-ups:** None for this story.
