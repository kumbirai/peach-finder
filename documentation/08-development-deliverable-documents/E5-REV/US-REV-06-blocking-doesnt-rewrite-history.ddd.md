---
title: DDD — US-REV-06 — Blocking doesn't rewrite history
updated: 2026-09-04
---

# US-REV-06 — Blocking doesn't rewrite history

**Epic:** Reviews & ratings (REV) — `user-stories.md` §8
**Priority:** M

## 1. Story

As either party, blocking prevents new contact but leaves existing reviews standing in both directions, so that blocking can't be used to scrub feedback.

## 2. Acceptance criteria

No dedicated acceptance-criteria list in `user-stories.md` §8 for this story — behavior is fully specified by the story statement above and the traces below.

## 3. Traces

FR-REV-07, FR-TRUST-08.

## 4. Build blueprint

**Primary LLD module:** `provider-reviews` (`../../05-low-level-design/06-provider-reviews/provider-reviews-lld.md`)
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
- `07-test-artifacts/04-traceability-matrix.md` row for US-REV-06 cross-references this DDD (applied in the stage-9 traceability pass).
- No application code exists yet for this story; this document is the blueprint an implementer builds from, not the implementation.

## 7. Implementation Notes

**Approach (2026-09-06):** FR-REV-07 is enforced architecturally — `provider-reviews` subscribes only to `ModerationActionTaken` (`handleReviewsModeration`); `UserBlocked` subscribers are limited to `direct-messaging.block-cache`, `discovery-search.exclude-blocker`, and `user-notifications.block-silence` per `event-catalog.ts`. No review rows, aggregates, or public serializers are filtered by block state; `listPublicReviewsForProvider`, `getSeekerReviewForProvider`, and `/provider/reviews` continue to serve existing reviews after a block. `applyUserBlockedSync` mirrors messaging/discovery/notification caches only — never touches `provider_reviews.*`.

**Tests:** Integration `blocking-preserves-reviews.integration.test.ts` (TC-REV-06a: seeker-initiated and provider-initiated blocks leave review rows, public listing, seeker own-review, and aggregate unchanged while messaging is blocked; event-catalog regression for no `provider-reviews` `UserBlocked` subscriber). Playwright `testing/playwright/e2e-block-unblock.e2e.ts` US-REV-06 block (TC-REV-06a: review visible on public profile and provider management page after live block; messaging rejected; axe on reviews section). Exported `SEED_SAFE02_REVIEW_ID` / `SEED_SAFE02_REVIEW_BODY` from `scripts/seed-blocking.ts`; extracted `seedSafe02BlockHistoryFixture` re-applied at end of `seed-reviews.ts` (after `seedCore` wipes Amara reviews) and added missing CLI entrypoint to `seed-reviews.ts` so the Playwright webServer seed chain actually runs.

**Assumption:** "Both directions" means both parties can still observe the pre-existing review (seeker on public profile / own-review page; provider on `/provider/reviews`) — there is no seeker-of-provider reverse rating in V1.
