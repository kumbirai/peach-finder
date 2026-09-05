---
title: DDD — US-SAFE-02 — Block: instant, silent, messages both ways
updated: 2026-09-04
---

# US-SAFE-02 — Block: instant, silent, messages both ways

**Epic:** Stay safe: report & block (SAFE) — `user-stories.md` §9
**Priority:** M

## 1. Story

As a seeker or provider, I want blocking to cut off contact immediately in both directions without notifying the other party, so that ending contact doesn't create a confrontation.

## 2. Acceptance criteria

- Blocking prevents new messages both ways instantly.
- Discovery hide is **asymmetric per FR-TRUST-08**: the blocker is hidden from the blocked party's future search/browse results; the blocked party is not hidden from the blocker's search.
- The blocked party receives no notification of the block, and their activity never generates notifications for the blocker.
- I can view and undo my own blocks in settings.

## 3. Traces

FR-TRUST-08, FR-NOTIF-03.

## 4. Build blueprint

**Primary LLD module:** `trust-and-safety` (`../../05-low-level-design/07-trust-and-safety/trust-and-safety-lld.md`)
**Supporting modules:** `discovery-search` (`../../05-low-level-design/04-discovery-search/discovery-search-lld.md`); `direct-messaging` (`../../05-low-level-design/05-direct-messaging/direct-messaging-lld.md`); `user-notifications` (`../../05-low-level-design/11-user-notifications/user-notifications-lld.md`)

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
- `07-test-artifacts/04-traceability-matrix.md` row for US-SAFE-02 cross-references this DDD (applied in the stage-9 traceability pass).
- No application code exists yet for this story; this document is the blueprint an implementer builds from, not the implementation.

## 7. Implementation Notes

**2026-09-05 — US-SAFE-02 delivered**

- **Backend:** Extended `POST /api/trust/blocks` with synchronous `applyUserBlockedSync` (messaging `block_cache`, discovery `blocked_pair`, notifications `notif_block_cache`) for instant FR-TRUST-08 enforcement without waiting for the worker. Added `GET /api/trust/blocks`, `DELETE /api/trust/blocks/:blockedId`, `listBlocks` / `unblockUser` use cases, and discovery-search `UserBlocked` / `UserUnblocked` subscribers wired in `src/worker/index.ts`. `insertBlock` / `removeBlock` now return whether a row changed and only publish outbox events on actual writes.
- **Frontend:** `BlockedPeopleList.svelte` on `/profile` — view and undo blocks with design-system `Card` / `Button`, empty-state copy matching prototype tone, `data-testid` hooks for e2e.
- **Seed:** `scripts/seed-blocking.ts` — TC-MSG-01c pre-blocked pair (with full cache mirrors), `safe02-seeker@example.com` thread + review history with Amara, Amara login credentials for e2e asymmetric discovery assertions.
- **Tests:** `block-unblock.integration.test.ts` (TC-SAFE-02a–d), `testing/playwright/e2e-block-unblock.e2e.ts` (live-stack-seeded).
- **Assumption:** Profile-update notifications do not exist in V1; TC-SAFE-02c silence is asserted via zero block notifications plus no new notifications when a blocked party's message send is rejected post-block.
