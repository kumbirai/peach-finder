---
title: DDD — US-VERIF-01 — Submit my identity claim
updated: 2026-09-04
---

# US-VERIF-01 — Submit my identity claim

**Epic:** Earn the identity badge (VERIF) — `user-stories.md` §12
**Priority:** M

## 1. Story

As a provider, I want to submit a government-ID photo and selfie from my dashboard against a published checklist, so that I can earn the "Identity verified" badge.

## 2. Acceptance criteria

- Submission enters the admin queue; I see status (pending/approved/rejected) on my dashboard.
- My documents are stored privately (encrypted bucket, admin-only, never displayed in-product) and purged ≤ 90 days after decision.
- My profile's visibility is completely unaffected at every stage.

## 3. Traces

FR-TRUST-02, FR-TRUST-03, FR-PRIV-05, SR-MEDIA-01.

## 4. Build blueprint

**Primary LLD module:** `trust-and-safety` (`../../05-low-level-design/07-trust-and-safety/trust-and-safety-lld.md`)
**Supporting modules:** `media-processing` (`../../05-low-level-design/12-media-processing/media-processing-lld.md`)

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
- `07-test-artifacts/04-traceability-matrix.md` row for US-VERIF-01 cross-references this DDD (applied in the stage-9 traceability pass).
- No application code exists yet for this story; this document is the blueprint an implementer builds from, not the implementation.

## 7. Implementation Notes

**Date:** 2026-09-06

**Approach:** Provider identity-claim flow is delivered in `trust-and-safety` (`submitVerificationClaim`, `resubmitVerificationClaim`, `getOwnVerificationStatus`) with identity-doc intake via `media-processing.storeIdentityDoc`. Routes: `POST /api/media/identity-docs`, `POST /api/trust/verification`, `POST /api/trust/verification/resubmit`, `GET /api/trust/verification/me`. UI: `/provider/verify` plus a dashboard verification section (`Get verified` / status banner). Open pending case returns `VERIFICATION_ALREADY_PENDING` (409); `verification_submit` rate limit enforced per LLD.

**Tests:** Integration `verification-submit.integration.test.ts` (TC-VERIF-01a–c, duplicate-pending guard, resubmit, rate limit). Playwright `testing/playwright/identity-verification.e2e.ts` extended with US-VERIF-01 journeys. `scripts/seed-verification.ts` now republishes fixture profiles, clears dual-role verification cases, and resets `verification_submit` rate-limit rows for repeatable E2E.

**Deviations:** Submission creates a `verification_case` row only — no domain event on submit (queue visibility is via DB read; admin notification is US-VERIF-02/US-ADMIN-02). Banner pending/rejected copy uses ink body text with terracotta icon for WCAG 4.5:1 contrast (4.45:1 on peach-on-blush failed axe).
