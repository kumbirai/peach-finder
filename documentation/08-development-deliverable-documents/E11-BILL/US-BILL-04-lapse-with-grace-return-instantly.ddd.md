---
title: DDD — US-BILL-04 — Lapse with grace, return instantly
updated: 2026-09-04
---

# US-BILL-04 — Lapse with grace, return instantly

**Epic:** Pay to be listed & featured (BILL) — `user-stories.md` §14
**Priority:** M

## 1. Story

As a provider whose payment failed or free period ended, I want a 7-day grace period with clear dunning, then auto-unpublish with everything retained, and instant republish the moment I pay, so that a billing hiccup never destroys my presence.

## 2. Acceptance criteria

- Grace default 7 days, listing stays live, dunning notifications sent; at grace end unpaid → auto-unpublished, all data retained.
- Paying at any point republishes immediately with no review step; webhook retries never double-charge or double-transition state (idempotent, SR-APP-12).
- All lapse messaging is framed as billing state, never as moderation.

## 3. Traces

FR-MONET-04, SR-APP-12, FR-NOTIF-01.

## 4. Build blueprint

**Primary LLD module:** `listing-billing` (`../../05-low-level-design/09-listing-billing/listing-billing-lld.md`)
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
- `07-test-artifacts/04-traceability-matrix.md` row for US-BILL-04 cross-references this DDD (applied in the stage-9 traceability pass).
- No application code exists yet for this story; this document is the blueprint an implementer builds from, not the implementation.

## 7. Implementation Notes

**Approach (2026-09-06):** Implemented FR-MONET-04 lapse lifecycle on the existing `listing_billing.listing` table (consistent with US-BILL-01..03 deviation from full `subscription` schema):

- Migration `0022_us_bill_04_lapse_lifecycle.sql` adds `processed_webhooks`, `dunning_dispatches`, and due-date indexes.
- Domain state machine (`domain/subscription-state.ts`) with guarded transitions in `infra/billing-transitions.ts` (audit + outbox in same TX).
- Paystack webhook `POST /api/billing/webhooks/paystack` with HMAC-SHA512 verification before any state read/write; fake-PSP signing when `PAYSTACK_SECRET_KEY` unset and `ALLOW_DEV_HELPERS=1`.
- Daily lifecycle job `runBillingLifecycleTick` (worker hourly tick + `POST /api/dev/billing-lifecycle-tick`): trial→grace, renewal-due→grace, grace→unpublished, dunning-day reminders via `dispatchGraceDunningReminder`.
- Provider reactions: `handleBillingListingLapsed` (unpublish reason `billing_lapse`), `handleRepublishAfterBillingLapse` on `PaymentSucceeded` (instant republish, no review).
- Self-serve `POST /api/billing/subscription/pay` initiates listing charge; fake gateway auto-delivers webhook inline and dispatches billing subscribers.
- UI: grace/unpublished billing status copy, pay-to-republish CTA on `/provider/billing`, billing-framed dashboard copy when `billingState=unpublished`.
- Discoverability: `grace`, `paid_listed`, and `free_listed` are publicly visible listing states (`domain/listing-visibility.ts`).
- Tests: `domain/subscription-state.test.ts`, `billing-lifecycle.integration.test.ts`, `testing/playwright/billing-lifecycle.e2e.ts`.

**Deviations:** Featuring force-lapse on listing transition deferred to US-BILL-05 (no `featuring_addon` table yet). Renewal charge initiation uses `chargeAuthorization` when credentials exist; otherwise daily job moves directly to grace.
