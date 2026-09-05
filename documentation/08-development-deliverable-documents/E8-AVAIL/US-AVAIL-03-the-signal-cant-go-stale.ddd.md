---
title: DDD — US-AVAIL-03 — The signal can't go stale
updated: 2026-09-04
---

# US-AVAIL-03 — The signal can't go stale

**Epic:** Run my availability (AVAIL) — `user-stories.md` §11
**Priority:** M

## 1. Story

As a seeker (beneficiary), I want "Available now" to auto-expire (default 4 h) with the provider warned ~15 min ahead and offered one-tap renewal, so that I'm never chasing yesterday's availability.

## 2. Acceptance criteria

- Status auto-expires after the configured duration; expiry enforced within 60 s of the deadline (SR-APP-04).
- Provider gets a pre-expiry notification with one-tap "Still available" that refreshes the timestamp.
- Expired status simply disappears — no negative marker; absence of availability is neutral, never a demerit.

## 3. Traces

FR-AVAIL-03, FR-AVAIL-05, SR-APP-04/10.

## 4. Build blueprint

**Primary LLD module:** `provider-availability` (`../../05-low-level-design/03-provider-availability/provider-availability-lld.md`)
**Supporting modules:** `user-notifications` (`../../05-low-level-design/11-user-notifications/user-notifications-lld.md`)

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
- `07-test-artifacts/04-traceability-matrix.md` row for US-AVAIL-03 cross-references this DDD (applied in the stage-9 traceability pass).
- No application code exists yet for this story; this document is the blueprint an implementer builds from, not the implementation.

## 7. Implementation Notes

### Session 2026-09-05 — feat/initial-implementation — Cursor Composer (US-AVAIL-03)

- Domain: added `windowIsOverdue`, `windowInWarnBand`, `warn`, and `expire` helpers in `availability-status.ts` (single source for sweep predicates).
- Backend: `runAvailabilityWarningTick`, `runAvailabilityExpirySweep`, and `runAvailabilityLifecycleTick` in `infra/availability-sweep.ts`; worker minute cadence tick; migration `0009_us_avail_03_stale_signal.sql` for `user_notifications.notification_log`.
- Notifications: `handleAvailabilityExpiryWarned` creates in-app renewal prompt; worker subscriber `user-notifications.renewal-prompt`; `GET /api/notifications/in-app`, `POST /api/notifications/in-app/read`.
- Frontend: `AvailabilityRenewalBanner.svelte` + dashboard `renewAvailability` action; `AvailabilityToggle` copy for `expiry_warned`.
- Dev helper: `POST /api/dev/availability-tick` runs lifecycle tick and inline notification dispatch for tests.
- Seed: `scripts/seed-availability.ts` (`SEED_PACK=seed-availability`).
- Tests: domain unit extensions, `expiry-sweep.integration.test.ts` (TC-AVAIL-03a/b/c), E2E `e2e/availability-lifecycle.e2e.ts`.
- Assumption: push/email channels for `availability_expiry_warning` deferred — in-app is the M baseline per FR-NOTIF-01; push adapter lands with full notifications wave.
