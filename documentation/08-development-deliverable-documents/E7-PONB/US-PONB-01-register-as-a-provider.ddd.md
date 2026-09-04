---
title: DDD — US-PONB-01 — Register as a provider
updated: 2026-09-04
---

# US-PONB-01 — Register as a provider

**Epic:** Become a provider & build my profile (PONB) — `user-stories.md` §10
**Priority:** M

## 1. Story

As a prospective provider, I want to register with my name, OTP-verified mobile number, and general service area, so that I have a draft profile to build on.

## 2. Acceptance criteria

- Registration captures display name, mobile number (verified via 6-digit OTP per SR-INT-02 limits), and general service location (area granularity).
- Completing registration creates a draft profile and drops me into the onboarding checklist.
- OTP failures/resends follow SR-INT-02 limits with friendly errors; the form never loses my input.

## 3. Traces

FR-ACC-03, SR-INT-02, FR-UX-05.

## 4. Build blueprint

**Primary LLD module:** `identity-and-access` (`../../05-low-level-design/01-identity-and-access/identity-and-access-lld.md`)
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
- `07-test-artifacts/04-traceability-matrix.md` row for US-PONB-01 cross-references this DDD (applied in the stage-9 traceability pass).
- No application code exists yet for this story; this document is the blueprint an implementer builds from, not the implementation.

## 7. Implementation Notes

### Session 2026-09-05 — feat/initial-implementation — Cursor Composer

**Approach:** Added migration `0004_us_ponb_01_provider_registration.sql` (`phone_otp`, `phone_registry_history`). Identity module gained `registerProvider`, `requestOtp`, `verifyOtp` with HMAC phone hashing, SR-INT-02 attempt limits, and `PhoneVerified` outbox publish. Provider-profile module gained `createDraftProfile` and `loadOwnerProfile` with publish-readiness/onboarding checklist derivation. Delivery layer: `/provider/register` (two-step form + OTP), `/provider/onboarding` checklist landing, `POST /api/identity/otp/request|verify`, `GET /api/provider/me/profile`, dev helper `POST /api/dev/otp-code`.

**Deviations:** Full six-step onboarding wizard UI is US-PONB-02 scope — this story lands a read-only checklist on `/provider/onboarding` that reflects `isPublishReady` fields. `PHONE_PEPPER` uses a dev fallback when unset (production throws). SMS delivery is dev-store backed (`ALLOW_DEV_HELPERS=1`) until `user-notifications` wires outbound SMS.

**Verification:** `npm run check`, `lint`, `test` (76), `test:integration` (20), `boundaries`, `build` green; `e2e/provider-register.e2e.ts` 3/3 (TC-PONB-01a/c + axe).

**Follow-ups:** US-PONB-02 should replace the onboarding placeholder with the resumable stepper; wire real SMS in `user-notifications`; set `PHONE_PEPPER` in production secrets.
