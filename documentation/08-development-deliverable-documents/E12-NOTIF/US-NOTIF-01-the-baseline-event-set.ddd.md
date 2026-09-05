---
title: DDD — US-NOTIF-01 — The baseline event set
updated: 2026-09-04
---

# US-NOTIF-01 — The baseline event set

**Epic:** The right nudge at the right time (NOTIF) — `user-stories.md` §15
**Priority:** M

## 1. Story

As the system, I dispatch: new message (push*/email if unread after a delay), identity review outcome (email + in-app), availability expiry warning (push*/in-app), billing events — trial ending, payment failed, grace warnings, unpublished (email + in-app), moderation outcomes affecting me (email + in-app, with reason), and report receipt (in-app). *Web push is the S-priority channel; email + in-app are the M baseline.*

## 2. Acceptance criteria

No dedicated acceptance-criteria list in `user-stories.md` §15 for this story — behavior is fully specified by the story statement above and the traces below.

## 3. Traces

FR-NOTIF-01, SR-APP-07.

## 4. Build blueprint

**Primary LLD module:** `user-notifications` (`../../05-low-level-design/11-user-notifications/user-notifications-lld.md`)

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
- `07-test-artifacts/04-traceability-matrix.md` row for US-NOTIF-01 cross-references this DDD (applied in the stage-9 traceability pass).
- No application code exists yet for this story; this document is the blueprint an implementer builds from, not the implementation.

## 7. Implementation Notes

**Date:** 2026-09-05

### Approach

Implemented the full FR-NOTIF-01 baseline event fan-out in `user-notifications`:

- Added `infra/dispatch.ts` (`recordNotification`) as the shared in-app + email delivery-log writer.
- Added `infra/event-handlers.ts` with idempotent handlers for: `UserRegistered` (welcome email), `VerificationDecided`, `ReviewSubmitted` (with block-silence), `ReportFiled`, `ReportResolved`, `ModerationActionTaken` (with reason copy), `PaymentSucceeded`/`PaymentFailed`, `GraceEntered`, `ListingLapsed`.
- Added `dispatchTrialEndingReminders` (worker tick) reading `listing_billing.listing.trial_ends_at` for `billing_trial_ending` — the listing-billing daily job is not yet built (US-BILL-04), so this sweep lives in notifications for now.
- Wired all nine missing `user-notifications.*` subscribers in `src/worker/index.ts`.
- Added `infra/dev-dispatch.ts` + `POST /api/dev/notification-dispatch` so Playwright can flush outbox notification subscribers without a running worker.

Existing handlers retained: `MessageSent` (batching), `AvailabilityExpiryWarned`, `UserBlocked`/`UserUnblocked` (block cache).

### Frontend

No new chrome — user-visible surfaces already landed in prior stories: availability renewal banner (US-AVAIL-03), message unread badges (US-MSG-04), thread safety report flow (US-MSG-06). This story completes the backend dispatch for all baseline categories; in-app rows are listable via `GET /api/notifications/in-app`.

### Tests

- `baseline-event-set.integration.test.ts` — TC-NOTIF-01a (all baseline categories + channels).
- `message-notifications.integration.test.ts` — TC-NOTIF-03a/b (unchanged).
- `testing/playwright/notifications-baseline.e2e.ts` — live-stack report receipt → in-app notification.

### Assumptions / deferrals

- **Push (S-priority)** and **SES email adapters** deferred — M baseline satisfied by `notification_log` rows (`in_app` + `email` channel records). Actual SES/VAPID send lands with channel-preference work (US-NOTIF-02/03).
- **`billing_trial_ending`** triggered by notifications worker sweep until listing-billing daily job exists.
- **`notification_preference` / `push_subscription` tables** not migrated — out of US-NOTIF-01 scope (US-NOTIF-02).
- **`NotificationDispatched` event** not yet published — metrics hook deferred; delivery rows exist in `notification_log`.
