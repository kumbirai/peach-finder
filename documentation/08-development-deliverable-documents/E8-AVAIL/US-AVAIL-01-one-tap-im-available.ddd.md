---
title: DDD — US-AVAIL-01 — One tap: I'm available
updated: 2026-09-04
---

# US-AVAIL-01 — One tap: I'm available

**Epic:** Run my availability (AVAIL) — `user-stories.md` §11
**Priority:** M

## 1. Story

As a provider, I want to set "Available now" with a single tap from my dashboard or profile, so that a freed-up slot becomes visibility in seconds.

## 2. Acceptance criteria

- Single-tap set from dashboard and from a persistent control on my own profile view, reachable within one screen of opening the app signed-in.
- Timestamp recorded on every set/re-set; discovery surfaces reflect it ≤ 30 s; re-setting refreshes the timestamp and moves me up the recency ordering.

## 3. Traces

FR-AVAIL-01, FR-AVAIL-04, SR-APP-03/04.

## 4. Build blueprint

**Primary LLD module:** `provider-availability` (`../../05-low-level-design/03-provider-availability/provider-availability-lld.md`)
**Supporting modules:** `discovery-search` (`../../05-low-level-design/04-discovery-search/discovery-search-lld.md`)

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
- `07-test-artifacts/04-traceability-matrix.md` row for US-AVAIL-01 cross-references this DDD (applied in the stage-9 traceability pass).
- No application code exists yet for this story; this document is the blueprint an implementer builds from, not the implementation.

## 7. Implementation Notes

### Session 2026-09-05 — feat/initial-implementation — Cursor Composer (US-AVAIL-01)

- Migration `0008_us_avail_01_one_tap_available.sql`: renamed Wave 0 `availability` → `availability_status`, added `warned_at`, enums, `availability_history`, indexes; idempotent for the project's re-run-all-migrations harness; drops orphan `availability` table recreated by `0001` on subsequent runs.
- Domain: `provider-availability/domain/availability-status.ts` state machine (set/renew/clear, discovery collapse for `expiry_warned`).
- Commands: `setAvailabilityForOwner`, `clearAvailabilityForOwner`, `getAvailabilityStatusForOwner` in `infra/availability-commands.ts`; synchronous `mirrorAvailabilityOnProjection` in discovery-search for ≤30s SLA plus async worker handler for `AvailabilitySet`/`AvailabilityCleared`/`AvailabilityExpired`.
- API: `POST`/`DELETE` `/api/availability/status`, `GET` `/api/availability/status/me`; `availability_toggle` rate limit bucket applied.
- UI: `AvailabilityToggle.svelte` on provider dashboard (hero) and profile preview (compact); matches prototype toggle tokens and copy.
- Tests: domain unit (`availability-status.test.ts`), integration (`set-availability.integration.test.ts` TC-AVAIL-01a/b/c), E2E (`testing/playwright/availability-one-tap.e2e.ts`).
- Verified: `npm run check`, `npm run lint`, `npm run test` (94), integration slice (3/3), `npm run build`, E2E availability-one-tap (2/2, `CI=1`).
