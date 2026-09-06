---
title: DDD — US-NOTIF-02 — My channels, my choice — except what protects me
updated: 2026-09-06
---

# US-NOTIF-02 — My channels, my choice — except what protects me

**Epic:** The right nudge at the right time (NOTIF) — `user-stories.md` §15
**Priority:** M

## 1. Story

As a user, I want per-channel control of non-essential notifications, while billing, security, and moderation notices always deliver, so that I can silence noise without being able to silence consequences.

## 2. Acceptance criteria

No dedicated acceptance-criteria list in `user-stories.md` §15 for this story — behavior is fully specified by the story statement above and the traces below.

## 3. Traces

FR-NOTIF-02.

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
- `07-test-artifacts/04-traceability-matrix.md` row for US-NOTIF-02 cross-references this DDD (applied in the stage-9 traceability pass).
- No application code exists yet for this story; this document is the blueprint an implementer builds from, not the implementation.

## 7. Implementation Notes

**Date:** 2026-09-06

### Approach

Implemented FR-NOTIF-02 channel preferences in `user-notifications`:

- Migration `0026_us_notif_02_notification_preference.sql` adds `notification_preference` table.
- Domain catalog in `domain/categories.ts` defines opt-out-able vs essential categories (billing/security/moderation always deliver).
- `infra/preference-commands.ts` implements `getNotificationPreferences`, `updateNotificationPreferences`, and dispatch gating helpers.
- `recordNotification`, `handleMessageSent`, and `handleAvailabilityExpiryWarned` honor per-channel opt-outs; essential categories bypass preference reads structurally.
- API: `GET/PUT /api/notifications/preferences` with ownership-scoped validation (422 on essential-category toggle attempts).
- Profile page (`/profile`) adds `NotificationPreferences.svelte` using the design-system toggle pattern (Terracotta focus ring, 44px targets, reduced-motion).

### Tests

- `domain/categories.test.ts` — essential/opt-out partition.
- `channel-preferences.integration.test.ts` — TC-NOTIF-02a/02b + essential toggle rejection.
- `NotificationPreferences.tokens.test.ts` — focus ring + reduced-motion gate.
- `testing/playwright/notifications-channel-preferences.e2e.ts` — live-stack UI + API preference flows.

### Assumptions / deferrals

- **Push adapter still deferred** (US-NOTIF-01 note): push appears in preferences UI/API and opt-out rows persist, but dispatch still records `in_app` + `email` only until VAPID send lands.
- **Prototype has no dedicated notifications screen** — preferences live on the authenticated Profile page alongside account settings, matching FR-NOTIF-02 "settings" placement and existing profile IA.
- **`exportFor` now includes preferences** per platform-configuration LLD §9 facade contract.
