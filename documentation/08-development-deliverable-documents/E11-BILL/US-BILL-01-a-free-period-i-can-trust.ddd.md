---
title: DDD — US-BILL-01 — A free period I can trust
updated: 2026-09-04
---

# US-BILL-01 — A free period I can trust

**Epic:** Pay to be listed & featured (BILL) — `user-stories.md` §14
**Priority:** M

## 1. Story

As a new provider, I want my free period to start when I first *publish* (not register) and to always see when it ends and what happens then, so that the clock never runs while I'm still building and the cliff is never a surprise.

## 2. Acceptance criteria

- Free period starts at first publish; length is platform-configured.
- Dashboard always shows free-period end date and what follows; "trial ending soon" notification fires per E12.

## 3. Traces

FR-MONET-01, FR-MONET-02, FR-ADM-06.

## 4. Build blueprint

**Primary LLD module:** `listing-billing` (`../../05-low-level-design/09-listing-billing/listing-billing-lld.md`)
**Supporting modules:** `platform-configuration` (`../../05-low-level-design/13-platform-configuration/platform-configuration-lld.md`); `user-notifications` (`../../05-low-level-design/11-user-notifications/user-notifications-lld.md`)

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
- `07-test-artifacts/04-traceability-matrix.md` row for US-BILL-01 cross-references this DDD (applied in the stage-9 traceability pass).
- No application code exists yet for this story; this document is the blueprint an implementer builds from, not the implementation.

## 7. Implementation Notes

**Approach (2026-09-06):** Free-period start at first publish and `TrialStarted` emission were already landed in US-PONB-04 via `startTrialOnPublish` (synchronous in the publish transaction). This story added provider-facing visibility:

- `GET /api/billing/status` — returns listing state, trial timestamps, and a `dashboard` view model composed in `listing-billing/domain/billing-status.ts` from platform-config grace days and listing price (never hardcoded).
- Provider dashboard surfaces `ListingBillingStatus` (free-period end + what happens next) and `TrialEndingBanner` when an unread `billing_trial_ending` in-app notification exists.
- `seed-core` now sets `trial_started_at` / `trial_ends_at` on seeded `free_listed` rows (`SEED_TRIAL_ENDS_AT`) so live-stack E2E can assert TC-BILL-01b/c without stubbing HTTP.
- Dev helper `POST /api/dev/trial-ending-dispatch` invokes the existing `dispatchTrialEndingReminders` sweep (same as worker tick) for E2E TC-BILL-01c.
- Playwright: `testing/playwright/billing-free-period.e2e.ts` (TC-BILL-01b/c). TC-BILL-01a remains covered by `provider-onboarding-publish.e2e.ts`.

**Deviations:** Wave-1 simplified `listing_billing.listing` table retained (not full `subscription` schema); sufficient for US-BILL-01. Full lifecycle table arrives with US-BILL-02..04. `/provider/billing` self-serve page deferred to US-BILL-03; trial-ending deep links from notifications still target that path but dashboard shows the banner inline for now.
