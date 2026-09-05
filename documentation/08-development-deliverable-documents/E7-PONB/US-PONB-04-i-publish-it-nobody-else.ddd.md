---
title: DDD — US-PONB-04 — I publish it. Nobody else.
updated: 2026-09-04
---

# US-PONB-04 — I publish it. Nobody else.

**Epic:** Become a provider & build my profile (PONB) — `user-stories.md` §10
**Priority:** M

## 1. Story

As a provider, I want my profile live the moment I hit Publish (minimum fields complete), so that going live is my decision alone.

## 2. Acceptance criteria

- Given minimum fields are complete (≥ 1 photo, intro, ≥ 1 priced service, ≥ 1 language, area), when I tap Publish, then the profile is publicly live immediately — no approval step, review queue, or automated content check stands between Publish and live.
- Publishing starts my free listing period (E11) and is reflected in search within ≤ 30 s.

## 3. Traces

FR-ACC-04, FR-PROF-02, FR-MONET-02, SR-APP-03.

## 4. Build blueprint

**Primary LLD module:** `provider-profile` (`../../05-low-level-design/02-provider-profile/provider-profile-lld.md`)
**Supporting modules:** `listing-billing` (`../../05-low-level-design/09-listing-billing/listing-billing-lld.md`); `discovery-search` (`../../05-low-level-design/04-discovery-search/discovery-search-lld.md`)

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
- `07-test-artifacts/04-traceability-matrix.md` row for US-PONB-04 cross-references this DDD (applied in the stage-9 traceability pass).
- No application code exists yet for this story; this document is the blueprint an implementer builds from, not the implementation.

## 7. Implementation Notes

### Session 2026-09-05 — feat/initial-implementation — Cursor Composer (US-PONB-04)

**Approach:** Added migration `0006_us_ponb_04_publish.sql` (`trial_started_at`, `trial_ends_at` on `listing_billing.listing`; default state `building`). `createDraftProfile` now seeds a `building` listing row. `publishProfileForOwner` validates publish-readiness, transitions `draft→published` (sets `first_published_at`), synchronously starts the free trial (`listing-billing.startTrialOnPublish` → `free_listed` + `TrialStarted`), upserts `discovery_search.search_projection`, and emits `ProviderPublished`. Delivery: `POST /api/provider/profile/publish`, onboarding publish form action + Publish button on the review step, `OwnerProfileDto.listing` trial fields. Worker handlers added as idempotent backup for outbox subscribers. Tests: `publish-profile.integration.test.ts` (TC-PONB-04a/b), `e2e/provider-onboarding-publish.e2e.ts` (TC-PONB-04a/b/c + axe).

**Deviations:** Trial/listing lifecycle uses the simplified Wave-1 `listing_billing.listing` table (not full `subscription` schema from billing LLD) — sufficient for free-period anchor at first publish; W5 billing expands it. Projection upsert and trial start run synchronously in the publish transaction (same pattern as US-ACC-05 unpublish) so E2E passes without a running worker.

**Verified:** `npm run check`, `lint`, `test` (87), `test:integration` publish suite (3/3), `boundaries`, `build`, `npx playwright test e2e/provider-onboarding-publish.e2e.ts` (2/2).

**Follow-ups:** US-PONB-06 unpublish/republish; US-BILL-01 dashboard copy for trial end; expand listing schema to full subscription model in W5.
