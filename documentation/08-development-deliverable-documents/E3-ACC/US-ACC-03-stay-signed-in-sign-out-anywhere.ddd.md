---
title: DDD — US-ACC-03 — Stay signed in, sign out anywhere
updated: 2026-09-04
---

# US-ACC-03 — Stay signed in, sign out anywhere

**Epic:** Get an account without losing my place (ACC) — `user-stories.md` §6
**Priority:** M

## 1. Story

As a seeker on my own phone, I want to stay signed in across visits, and to be able to sign out explicitly, so that return visits are instant but shared devices stay safe.

## 2. Acceptance criteria

- Sessions persist by default ("keep me signed in", 90-day rolling); explicit sign-out is available on every authenticated surface and revokes the session immediately.
- Password reset works via single-use emailed link (≤ 1 h expiry); email/phone/password changes require re-authentication and revoke other sessions (SR-SEC-04).

## 3. Traces

FR-ACC-06, FR-ACC-09, SR-SEC-04.

## 4. Build blueprint

**Primary LLD module:** `identity-and-access` (`../../05-low-level-design/01-identity-and-access/identity-and-access-lld.md`)

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
- `07-test-artifacts/04-traceability-matrix.md` row for US-ACC-03 cross-references this DDD (applied in the stage-9 traceability pass).
- No application code exists yet for this story; this document is the blueprint an implementer builds from, not the implementation.

## 7. Implementation Notes

### 2026-09-04 — feat/initial-implementation — Cursor Composer

**Approach:** Extended `identity-and-access` with password-reset tokens (migration `0003_us_acc_03_password_reset.sql`), session revocation helpers, password reset / change-password / reauth commands, and cookie helpers. Delivery routes: `POST /api/identity/logout`, `POST /api/identity/account/reauth`, `POST /api/identity/account/password`, `/forgot-password`, `/reset-password`, and account settings on `/profile`. Navigation exposes sign-out when `signedIn` (root layout); profile holds sign-out and change-password forms. Sessions default to 90-day rolling idle via existing hook touch + cookie max-age (`domain/session-policy.ts`).

**Deviations:** Email/phone change endpoints (LLD #14–15) deferred to US-ACC-05 / provider onboarding — this story’s test matrix exercises password reset and password change only; reauth API is implemented for downstream credential flows. Password-reset emails are dev-store backed (`ALLOW_DEV_HELPERS=1`) until `user-notifications` wires outbound mail. Sign-in accepts `?flow=sign-in` so returning users land directly on login without toggling modes.

**Verification:** `npm run check`, `lint`, `test` (62), `test:integration` (8), `boundaries`, `build`, `test:e2e` (17 incl. `e2e/stay-signed-in.e2e.ts` TC-ACC-03a–d + axe on profile/forgot-password).

**Follow-ups:** Wire real reset email via `user-notifications`; add email/phone change UI when US-ACC-05 lands; mobile nav could expose sign-out without visiting profile (optional polish).
