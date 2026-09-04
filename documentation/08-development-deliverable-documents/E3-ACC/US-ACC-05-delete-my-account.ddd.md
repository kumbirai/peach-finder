---
title: DDD — US-ACC-05 — Delete my account
updated: 2026-09-04
---

# US-ACC-05 — Delete my account

**Epic:** Get an account without losing my place (ACC) — `user-stories.md` §6
**Priority:** M

## 1. Story

As any user, I want to delete my account and understand what happens to my traces, so that leaving is a right, not a negotiation.

## 2. Acceptance criteria

- Deletion is self-serve with a confirmation step (FR-UX-05); provider deletion unpublishes the profile immediately.
- My message threads remain for the other party labelled "Deleted account"; my reviews remain attributed to "Former user".
- Personal data is deleted/irreversibly anonymized ≤ 30 days; what survives (billing/tax, moderation records) is stated in plain language at the point of deletion.

## 3. Traces

FR-ACC-07, FR-PRIV-03, SR-DATA-04.

## 4. Build blueprint

**Primary LLD module:** `identity-and-access` (`../../05-low-level-design/01-identity-and-access/identity-and-access-lld.md`)
**Supporting modules:** `direct-messaging` (`../../05-low-level-design/05-direct-messaging/direct-messaging-lld.md`); `provider-reviews` (`../../05-low-level-design/06-provider-reviews/provider-reviews-lld.md`)

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
- `07-test-artifacts/04-traceability-matrix.md` row for US-ACC-05 cross-references this DDD (applied in the stage-9 traceability pass).
- No application code exists yet for this story; this document is the blueprint an implementer builds from, not the implementation.

## 7. Implementation Notes

### 2026-09-05 — feat/initial-implementation — Cursor Composer

**Approach:** Implemented FR-ACC-07 / FR-PRIV-03 two-phase account deletion in `identity-and-access`: `DELETE /api/identity/account` (password + `confirm: true`) runs phase-1 in one transaction — `status=deleted`, session/oauth/token revocation, synchronous `provider-profile.unpublishProfileForOwner` + discovery projection removal + `listing-billing.cancelListingForOwner`, and `AccountDeletionRequested` outbox event. Phase-2 `anonymizePendingUsers` job runs on the worker tick (≤30-day window). Profile `/profile` adds a delete section with plain-language survivorship copy and a confirmation step (FR-UX-05). `direct-messaging` subscribes to `AccountDeletionRequested` to denormalize `is_deleted_sender_account`; thread/review labels resolve at read time via `getDisplayIdentity` ("Deleted account" / "Former user").

**Deviations:** OAuth-only accounts without a password must set one (via reset email) before self-delete — LLD reauth is password-based and no OAuth re-proof flow exists in W1. Provider unpublish runs synchronously in the delete transaction (not only async) so TC-ACC-05b immediate-discovery removal holds without waiting for the outbox worker.

**Verification:** `npm run check`, `lint`, `test`, `test:integration`, `boundaries`, `build`, `test:e2e` (incl. `e2e/delete-my-account.e2e.ts` TC-ACC-05a–c + axe).

**Follow-ups:** Wire `provider-profile.unpublish-on-delete` and `listing-billing.cancel-on-delete` worker handlers as idempotent backups if synchronous path is ever split; add OAuth-native delete confirmation when SR-INT-04 gains a re-proof path.
