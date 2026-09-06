---
title: DDD — US-VERIF-03 — Badge suppression on identity-relevant changes
updated: 2026-09-04
---

# US-VERIF-03 — Badge suppression on identity-relevant changes

**Epic:** Earn the identity badge (VERIF) — `user-stories.md` §12
**Priority:** M

## 1. Story

As a verified provider who changes my display name or verified phone, I want the badge suppressed (not revoked) pending a lightweight re-review, with a clear explanation of why and what to do, so that the badge stays truthful without punishing me.

## 2. Acceptance criteria

- Badge hidden, not revoked; profile visibility untouched; plain-language explanation with the re-review path.

## 3. Traces

FR-TRUST-04.

## 4. Build blueprint

**Primary LLD module:** `trust-and-safety` (`../../05-low-level-design/07-trust-and-safety/trust-and-safety-lld.md`)
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
- `07-test-artifacts/04-traceability-matrix.md` row for US-VERIF-03 cross-references this DDD (applied in the stage-9 traceability pass).
- No application code exists yet for this story; this document is the blueprint an implementer builds from, not the implementation.

## 7. Implementation Notes

**Date:** 2026-09-06

**Approach:** Badge suppression (FR-TRUST-04) was delivered in US-PONB-05: `handleIdentityAttributesChanged` in `trust-and-safety/infra/identity-change-subscription.ts` subscribes to `identity-and-access`'s `IdentityAttributesChanged` for `{display_name, phone}`; sets `badge_state.suppressed=true` without clearing `identity_verified`; opens a pending re-review case when none exists; publishes `BadgeRevoked(identity_verified, reason='suppressed_pending_rereview')`. Synchronous delivery via `applyIdentityAttributesChangedSync` on display-name save (`/profile`, `POST /api/identity/account/display-name`) refreshes discovery badge flag immediately. Owner-facing plain-language copy (`BADGE_SUPPRESSION_REASON`) surfaces on `/profile` and `/provider/profile/edit` through `loadOwnerBadgeNotice`. Public badge display uses `identity_verified AND NOT suppressed` in `loadBadgeDisplayState`. Admin re-approval clears suppression via `approveVerification` (US-VERIF-02).

**Tests:** Integration `badge-suppression.integration.test.ts` (TC-VERIF-03a: phone `IdentityAttributesChanged` suppresses badge without revoking underlying verification or unpublishing profile; idempotency; non-identity fields ignored). Existing `edit-live-always.integration.test.ts` (TC-PONB-05b display-name path), `badge-read.integration.test.ts` (display rule). Playwright `testing/playwright/identity-verification.e2e.ts` US-VERIF-03 block (TC-VERIF-03a live-stack: grant badge → rename → badge hidden on profile/search, re-review case in admin queue, profile fully visible, suppression notice on profile + edit pages; axe).

**Deviations:** Phone change UI/API (`POST /api/identity/account/phone`, LLD #15) remains deferred per US-ACC-03 — phone suppression is exercised in integration tests via `IdentityAttributesChanged{changedFields:['phone']}`; display-name E2E proves the live-stack path end-to-end. `seed-verification` seeds an approved-then-suppressed fixture (Thandi, profile `01900000-0000-7000-8000-000000000102`) for admin-queue scenarios.
