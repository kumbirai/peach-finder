---
title: DDD — US-NOTIF-03 — Never a spam cannon
updated: 2026-09-04
---

# US-NOTIF-03 — Never a spam cannon

**Epic:** The right nudge at the right time (NOTIF) — `user-stories.md` §15
**Priority:** M

## 1. Story

As a user, bursts collapse into one notification, and a blocked party's activity never generates a notification for me.

## 2. Acceptance criteria

No dedicated acceptance-criteria list in `user-stories.md` §15 for this story — behavior is fully specified by the story statement above and the traces below.

## 3. Traces

FR-NOTIF-03.

## 4. Build blueprint

**Primary LLD module:** `user-notifications` (`../../05-low-level-design/11-user-notifications/user-notifications-lld.md`)
**Supporting modules:** `trust-and-safety` (`../../05-low-level-design/07-trust-and-safety/trust-and-safety-lld.md`)

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
- `07-test-artifacts/04-traceability-matrix.md` row for US-NOTIF-03 cross-references this DDD (applied in the stage-9 traceability pass).
- No application code exists yet for this story; this document is the blueprint an implementer builds from, not the implementation.

## 7. Implementation Notes

**Date:** 2026-09-06

### Approach

US-NOTIF-03 (FR-NOTIF-03) burst batching and block silence were introduced in US-MSG-04 / US-NOTIF-01; this story formalizes ownership, completes the user-visible surface, and adds dedicated regression coverage:

- **Backend (`user-notifications`):** Retained `handleMessageSent` burst windows (`notification_batch_window`), `flushDueNotificationBatchWindows` worker tick, `block_cache` + `isNotifBlockedBetween` gate on `new_message` and `review_received`, and synchronous mirror via `applyUserBlockedSync` (US-SAFE-02). Added `forceFlushOpenNotificationBatchWindows` and `POST /api/dev/notification-batch-flush` for live-stack e2e flush assertions.
- **Frontend:** `InAppNotificationList.svelte` on `/profile` — SSR unread in-app rows (including collapsed burst copy after flush) with design-system `Card` links, reduced-motion, and axe-friendly list semantics.
- **Tests:** `message-notifications.integration.test.ts` (TC-NOTIF-03a/b, flush collapse title, review block silence); `InAppNotificationList.tokens.test.ts`; `testing/playwright/notifications-spam-cannon.e2e.ts` (TC-NOTIF-03a/b live-stack).

### Assumptions / deferrals

- **Push on first message** remains deferred per US-NOTIF-01/02 — M baseline is in-app + email-on-flush; burst collapse updates the in-app row title at flush.
- **No dedicated notifications inbox route in prototype** — unread items surface on Profile alongside channel preferences (US-NOTIF-02 IA); full deep-link chrome is US-NOTIF-04.
- **TC-NOTIF-03b live e2e** asserts block silence via messaging rejection + unchanged in-app count; integration test additionally covers defense-in-depth when `MessageSent`/`ReviewSubmitted` handlers run with `block_cache` populated.
