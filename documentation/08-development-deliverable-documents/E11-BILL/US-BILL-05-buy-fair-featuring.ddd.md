---
title: DDD — US-BILL-05 — Buy fair featuring
updated: 2026-09-04
---

# US-BILL-05 — Buy fair featuring

**Epic:** Pay to be listed & featured (BILL) — `user-stories.md` §14
**Priority:** M

## 1. Story

As a paying provider, I want to add featuring as a recurring add-on that boosts my placement within the E1 fairness rules, so that I can buy visibility without the platform selling seekers a lie.

## 2. Acceptance criteria

- Featuring requires an active listing; a lapsed listing suspends featuring automatically (nothing hidden can be featured).
- Ranking effect and "Featured" labelling behave exactly per US-DISC-06.

## 3. Traces

FR-MONET-05, FR-SRCH-08.

## 4. Build blueprint

**Primary LLD module:** `listing-billing` (`../../05-low-level-design/09-listing-billing/listing-billing-lld.md`)
**Supporting modules:** `discovery-search` (`../../05-low-level-design/04-discovery-search/discovery-search-lld.md`)

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
- `07-test-artifacts/04-traceability-matrix.md` row for US-BILL-05 cross-references this DDD (applied in the stage-9 traceability pass).
- No application code exists yet for this story; this document is the blueprint an implementer builds from, not the implementation.

## 7. Implementation Notes

**Approach:** Added `listing_billing.featuring_addon` (migration `0023_us_bill_05_featuring_addon.sql`) keyed by `provider_profile_id` to match the existing listing table shape. Purchase/cancel-renewal endpoints (`POST /api/billing/featuring`, `POST /api/billing/featuring/cancel`), featuring transitions (activate, renew, force-lapse), webhook routing via `metadata.lineItem`, daily-job featuring renewal/lapse, and `FeaturingActivated`/`FeaturingLapsed` outbox events with `discovery-search.featuring` projection updates (`is_featured` / `featured_since`). Listing transitions out of `free_listed`/`paid_listed` force-lapse active featuring in the same transaction. Provider billing UI section added on `/provider/billing`.

**Deviations:** Schema uses `provider_profile_id` instead of LLD's `subscription_id` FK because this codebase models one listing row per provider with `provider_profile_id` as PK (US-BILL-01..04 convention). Fake-PSP featuring purchase completes inline (same pattern as listing pay in US-BILL-04); production Paystack path relies on signed webhooks.

**Follow-ups:** None identified.
