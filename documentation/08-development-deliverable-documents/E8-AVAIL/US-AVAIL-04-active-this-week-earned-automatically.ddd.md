---
title: DDD — US-AVAIL-04 — "Active this week", earned automatically
updated: 2026-09-04
---

# US-AVAIL-04 — "Active this week", earned automatically

**Epic:** Run my availability (AVAIL) — `user-stories.md` §11
**Priority:** M

## 1. Story

As a provider, I want the "Active this week" badge computed from my actual activity (sign-in, availability, edits, messages in trailing 7 days) with no human involved, so that staying visible just means staying active.

## 2. Acceptance criteria

- Badge appears/disappears purely by computation, evaluated at least daily; no admin can grant or edit it.

## 3. Traces

FR-AVAIL-06, FR-TRUST-06.

## 4. Build blueprint

**Primary LLD module:** `trust-and-safety` (`../../05-low-level-design/07-trust-and-safety/trust-and-safety-lld.md`)
**Supporting modules:** `identity-and-access` (`../../05-low-level-design/01-identity-and-access/identity-and-access-lld.md`); `provider-availability` (`../../05-low-level-design/03-provider-availability/provider-availability-lld.md`); `provider-profile` (`../../05-low-level-design/02-provider-profile/provider-profile-lld.md`); `direct-messaging` (`../../05-low-level-design/05-direct-messaging/direct-messaging-lld.md`)

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
- `07-test-artifacts/04-traceability-matrix.md` row for US-AVAIL-04 cross-references this DDD (applied in the stage-9 traceability pass).
- Implementation complete per section 7; acceptance verified on the live-seeded stack.

## 7. Implementation Notes

**Date:** 2026-09-05

**Approach:** Implemented the `trust-and-safety` daily four-signal OR job per LLD §5 as the sole writer of `badge_state.active_this_week`. The job calls `identity-and-access.hasSignedInSince`, `provider-availability.getRecentActivityCount`, `provider-profile.updatedAtSince`, and `direct-messaging.hasSentSince`, then grants or revokes via `BadgeGranted`/`BadgeRevoked(active_this_week)` outbox events (consumed by `discovery-search.badge-flag`). Wired into the worker on a 24-hour cadence; dev helper `POST /api/dev/active-this-week-tick` mirrors `availability-tick` for live-stack tests.

**Frontend:** No new UI — badge display on `ProviderCard` and `PublicProfileView` was delivered in US-VIEW-04; this story only changes whether the badge is earned automatically.

**Tests:** Domain unit (`active-this-week.test.ts`), integration (`active-this-week-job.integration.test.ts`), grep guard (`active-this-week-writer-guard.test.ts`), Playwright (`testing/playwright/active-this-week.e2e.ts` for TC-AVAIL-04a/b).

**Deviations:** Fixed `getRecentActivityCount` to bind `since` as an ISO timestamptz string — `postgres.js` rejects raw `Date` in `db.execute` params (latent bug surfaced when the facade was first called on the live stack).

**Date:** 2026-09-06

**Verification:** `npm run check` and `npm run lint` clean; `npm run test` (228 unit tests) green; `npm run test:integration` (3 tests in `active-this-week-job.integration.test.ts`) green after backdating Zanele seed profile `updated_at` in TC-AVAIL-04a so seed-time `new Date()` does not false-trigger the profile-edited signal; Playwright `active-this-week.e2e.ts` (TC-AVAIL-04a/b) passed live-stack-seeded with zero critical/serious axe violations on trust badges.
