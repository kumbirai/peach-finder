---
title: DDD — US-VIEW-01 — Everything I need to decide, on one screen
updated: 2026-09-04
---

# US-VIEW-01 — Everything I need to decide, on one screen

**Epic:** Judge a provider from their profile (VIEW) — `user-stories.md` §5
**Priority:** M

## 1. Story

As a seeker, I want the full profile — photos, intro, services with prices, tags, languages, reviews, response time, online status, and contact actions — so that the profile replaces the "so, tell me about yourself" phone call.

## 2. Acceptance criteria

- Profile renders the complete FR-PROF-01 field set; gallery supports 1–12 photos with the primary first.
- Trust badges sit directly under the provider name; rating average + count near the top — trust signals are above the fold at 360 px (FR-PROF-10).
- Services are listed with name, optional description, duration, and price.
- Profile is viewable without an account, loads ≤ 2.5 s on subsequent navigations, and renders server-side with correct link-preview metadata.

## 3. Traces

FR-PROF-01, FR-PROF-10, FR-ACC-01, FR-UX-02, FR-UX-08.

## 4. Build blueprint

**Primary LLD module:** `provider-profile` (`../../05-low-level-design/02-provider-profile/provider-profile-lld.md`)

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
- `07-test-artifacts/04-traceability-matrix.md` row for US-VIEW-01 cross-references this DDD (applied in the stage-9 traceability pass).
- No application code exists yet for this story; this document is the blueprint an implementer builds from, not the implementation.

## 7. Implementation Notes

### Session 2026-09-05 — feat/initial-implementation — Cursor Composer (US-VIEW-01)

- **Backend:** Wired `direct-messaging.getPresence` and `getResponseTime` facades (message-activity based; no presence table yet) into `loadProfileView`. Public profile API unchanged (`GET /api/provider/profile/:id`); serializers already exposed full field set.
- **Frontend:** Enhanced `PublicProfileView` — photo gallery with thumbnails, trust badges under name (FR-PROF-10), rating/online/response-time stats, service descriptions, review formatting, prototype-aligned section styling. Added `active-week` badge kind. Full Open Graph metadata on `/provider/:id`.
- **Seed:** Extended Amara profile with 2 extra gallery photos, 3 response-time sample threads, and recent provider message for presence display.
- **Tests:** `profile-display.test.ts`, `presence-buckets.test.ts`, `response-time-bucket.test.ts`, `provider-profile-view.integration.test.ts` (TC-VIEW-01a); extended `search-to-contact.e2e.ts` with TC-VIEW-01a/b/c.
- **Assumption:** Online status and response time derive from `direct_messaging.message` activity until the presence heartbeat table lands in US-MSG stories; graceful `null` when sample count &lt; 3 for response time.

### Verification 2026-09-05

- `npm run check` — 0 errors (5 pre-existing Svelte warnings).
- `npm run lint` — clean.
- `npm run test` — 159/159 unit tests passed.
- `npm run test:integration -- provider-profile-view` — 1/1 passed (TC-VIEW-01a API field set).
- `npm run test:e2e -- search-to-contact.e2e.ts` — 7/7 passed (TC-VIEW-01a/b/c, axe clean).
