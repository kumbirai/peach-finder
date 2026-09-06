---
title: DDD — US-PRIV-04 — Terms I actually agreed to
updated: 2026-09-04
---

# US-PRIV-04 — Terms I actually agreed to

**Epic:** My data, my contact details (PRIV) — `user-stories.md` §17
**Priority:** M

## 1. Story

As a new user, a plain-language privacy policy and ToS are linked from footer, sign-up, and provider onboarding, and require my affirmative acceptance at registration.

## 2. Acceptance criteria

No dedicated acceptance-criteria list in `user-stories.md` §17 for this story — behavior is fully specified by the story statement above and the traces below.

## 3. Traces

FR-PRIV-07.

## 4. Build blueprint

**Primary LLD module:** `identity-and-access` (`../../05-low-level-design/01-identity-and-access/identity-and-access-lld.md`)
**Foundations cited:** ToS/privacy-policy content itself is out of LLD/DDD scope (a legal-content matter, per `user-stories.md` §17's closing note) — this DDD covers only the acceptance-capture mechanism.

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
- `07-test-artifacts/04-traceability-matrix.md` row for US-PRIV-04 cross-references this DDD (applied in the stage-9 traceability pass).
- No application code exists yet for this story; this document is the blueprint an implementer builds from, not the implementation.

## 7. Implementation Notes

### 2026-09-06 — feat/initial-implementation — Cursor Composer

**Approach:** Implemented FR-PRIV-07 terms acceptance capture and legal-document surfacing for US-PRIV-04:

- `identity-and-access`: migration `0028_us_priv_04_terms_acceptance.sql` adds `terms_acceptance` table recording each user's accepted `privacy-policy` and `terms-of-service` version at registration; `recordTermsAcceptance` runs inside seeker (`registerSeeker`) and provider (`registerProvider`) transactions when `acceptedTerms` is true; validation rejects registration when false (existing LLD contract field).
- `exportFor` now returns the user's terms-acceptance rows for SR-DATA-07 subject-access exports.
- Frontend: plain-language `/privacy` and `/terms` pages; shared `LegalDocumentLinks` / `LegalConsentText` components; links added to site footer, seeker sign-up, provider registration, and provider onboarding.
- Sign-up and provider registration use HTML5 `required` on the acceptance checkbox plus server-side validation; sign-up form now surfaces server validation issues.

**Deviations:** Legal page body copy is placeholder plain-language text (per DDD scope note — substance is a legal-content matter, not engineering). Google OAuth new-user registration does not yet capture terms acceptance; email/password and provider OTP paths are covered. Record as follow-up if OAuth sign-up volume warrants an interstitial.

**Verification:** `npm run lint`; `npm run test:integration -- terms-acceptance.integration.test.ts` (TC-PRIV-04b + acceptance recording); `npm run test -- legal-documents.test.ts`; `CI=1 npm run test:e2e -- terms-acceptance.e2e.ts` (TC-PRIV-04a/b + axe on legal pages). `npm run check` still reports pre-existing errors in unrelated modules (`trust-and-safety`, `account-lookup`, admin-login-challenge).

**Follow-ups:** OAuth registration terms gate; legal-content review by counsel before production launch.
