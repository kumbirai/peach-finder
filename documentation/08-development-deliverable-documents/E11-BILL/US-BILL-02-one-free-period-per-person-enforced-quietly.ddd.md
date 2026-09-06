---
title: DDD — US-BILL-02 — One free period per person, enforced quietly
updated: 2026-09-04
---

# US-BILL-02 — One free period per person, enforced quietly

**Epic:** Pay to be listed & featured (BILL) — `user-stories.md` §14
**Priority:** M

## 1. Story

As the platform, one free period is granted per OTP-verified phone number; re-registering with a previously-used number resumes prior billing state rather than granting a new trial.

## 2. Acceptance criteria

- Re-registration with a used number gets listing continuity, not a fresh trial; messaging explains the state plainly without accusing.

## 3. Traces

FR-MONET-03.

## 4. Build blueprint

**Primary LLD module:** `listing-billing` (`../../05-low-level-design/09-listing-billing/listing-billing-lld.md`)
**Supporting modules:** `identity-and-access` (`../../05-low-level-design/01-identity-and-access/identity-and-access-lld.md`)

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
- `07-test-artifacts/04-traceability-matrix.md` row for US-BILL-02 cross-references this DDD (applied in the stage-9 traceability pass).
- No application code exists yet for this story; this document is the blueprint an implementer builds from, not the implementation.

## 7. Implementation Notes

**Approach (2026-09-06):** Implemented FR-MONET-03 free-period anti-abuse at first publish per listing-billing LLD §9:

- Migration `0020_us_bill_02_free_period_anti_abuse.sql` adds `phone_history_ref`, `grace_ends_at`, and `billing_continuity` to `listing_billing.listing`.
- `identity-and-access` facades: `getVerifiedPhoneHash`, `getPhoneVerifiedAt`, `wasPhoneUsedBefore` (compares `phone_registry_history.first_registered_at` against current verification time).
- `startTrialOnPublish` now accepts `ownerId`, resolves `resolveTrialStartPlan` / `inferResumedListingState`, and either starts a new trial, resumes prior listing clocks from a findable `phone_history_ref` row, or places the provider in immediate payment-required `grace` with `billing_continuity = no_trial`.
- `PhoneVerified` worker subscriber `listing-billing.trial-eligibility` primes `phone_history_ref` on building listings via `handlePhoneVerifiedForTrialEligibility`.
- Provider dashboard `ListingBillingStatus` and `GET /api/billing/status` expose resumed/grace copy via extended `buildProviderBillingStatusView` (plain continuity wording per user-stories §21.4 — no accusatory framing).
- Dev helper `POST /api/dev/billing-continuity-snapshot` supports live-stack Playwright for TC-BILL-02b messaging assertions.
- Tests: `domain/trial-eligibility.test.ts`, `domain/billing-status.test.ts`, `free-period-anti-abuse.integration.test.ts` (TC-BILL-02a/b), `identity-and-access/phone-registry-read.integration.test.ts`, `testing/playwright/billing-phone-reuse.e2e.ts`.

**Deviations:** Simplified `listing_billing.listing` table retained (not full `subscription` schema). Resume infers live state from stored timestamps when prior row was `cancelled` on account deletion. Payment-required posture uses `grace` with `grace_ends_at = now` per LLD §9 edge case rather than a separate enum value.
