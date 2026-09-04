---
title: DDD — US-ACC-04 — One person, both roles
updated: 2026-09-04
---

# US-ACC-04 — One person, both roles

**Epic:** Get an account without losing my place (ACC) — `user-stories.md` §6
**Priority:** S

## 1. Story

As a therapist who also books massages, I want both roles under one login with an explicit switch, so that I don't juggle two accounts.

## 2. Acceptance criteria

- Role switch is explicit and visible; messages, reviews, and analytics for the two roles never co-mingle in the UI.

## 3. Traces

FR-ACC-08.

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
- `07-test-artifacts/04-traceability-matrix.md` row for US-ACC-04 cross-references this DDD (applied in the stage-9 traceability pass).
- No application code exists yet for this story; this document is the blueprint an implementer builds from, not the implementation.

## 7. Implementation Notes

### 2026-09-04 — feat/initial-implementation — Cursor Composer

**Approach:** Implemented FR-ACC-08 dual-role capability per identity LLD §4.2/§5.1 endpoint #19: `resolveCapabilities()` composes `ownsProfile` + `getUserCapabilities`; `GET /api/identity/me/capabilities` exposes the DTO. Role switch is explicit navigation via new `RoleSwitch.svelte` (Seeker → `/messages`, Provider → `/provider/dashboard`) shown in `Navigation.svelte` when `capabilities.isProvider`. Provider routes enforce `_requiredRole: 'provider'` on `/provider/dashboard`; seeker-side data loads on `/messages` (conversations + reviews written). Provider dashboard shows inbox threads + analytics stats only — no seeker threads/reviews. Seed pack extended with dual-role user `dual@example.com` / `password123` (Jordan B.) plus separated thread/review fixtures.

**Deviation:** No new migration — uses existing `direct_messaging` and `provider_profile` tables from Wave 0/US-ACC-01/02. Minimal read helpers added to `direct-messaging` (`listSeekerThreads`, `listProviderInbox`) and `provider-reviews` (`listReviewsWrittenBySeeker`, `countReviewsOnProfile`) to prove UI separation; full messaging/analytics modules remain later-wave scope. Provider analytics headline numbers (profile views, search appearances) are seeded static values until `provider-analytics` lands — contact requests and reviews received are live counts from DB.

**Verification:** `npm run check`, `lint`, `test` (64), `test:integration` (11 incl. `one-person-both-roles.integration.test.ts`), `boundaries`, `build`, `test:e2e` `e2e/one-person-both-roles.e2e.ts` (3/3, TC-ACC-04a + axe on messages/dashboard).

**Follow-ups:** Wire live analytics aggregates when `provider-analytics` (Wave 4+) ships; thread detail routes when US-MSG stories land.
