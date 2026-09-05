---
title: DDD — US-VIEW-05 — Reviews I can weigh
updated: 2026-09-04
---

# US-VIEW-05 — Reviews I can weigh

**Epic:** Judge a provider from their profile (VIEW) — `user-stories.md` §5
**Priority:** M

## 1. Story

As a seeker, I want the review list with ratings, text, coarse dates, and reviewer first name + initial, so that I can judge the pattern, not just the average.

## 2. Acceptance criteria

- Profile shows average, count, and reviews newest-first; each shows rating, text, "Thandi M.", and month/year only (never exact dates).
- "Edited" marker on edited reviews; provider replies (where present) appear beneath the review.

## 3. Traces

FR-REV-03, FR-REV-04, FR-REV-06.

## 4. Build blueprint

**Primary LLD module:** `provider-reviews` (`../../05-low-level-design/06-provider-reviews/provider-reviews-lld.md`)

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
- `07-test-artifacts/04-traceability-matrix.md` row for US-VIEW-05 cross-references this DDD (applied in the stage-9 traceability pass).
- No application code exists yet for this story; this document is the blueprint an implementer builds from, not the implementation.

## 7. Implementation Notes

### Session 2026-09-05 — feat/initial-implementation — Cursor Composer (US-VIEW-05)

- **Backend:** Migration `0013_us_view_05_reviews.sql` adds `is_edited`, `edited_at`, `reply_body`, `replied_at` to `provider_reviews.review`. Implemented `provider-reviews` public read path: `toPublicReview` serializer (first-name + initial, month/year only — no exact timestamps in public payloads), `listPublicReviewsForProvider` with cursor pagination, and `GET /api/reviews/provider/:providerProfileId` (anonymous, `search_query` rate limit). `provider-profile.getPublicProfile` now loads reviews via the `provider-reviews` facade instead of inline SQL.
- **Frontend:** `PublicProfileView` reviews section shows rating stars, reviewer label, body, month/year date, italic `edited` marker, and a Pine-tinted provider-reply block beneath when present. SSR uses server-serialized `dateLabel` so exact ISO dates never appear in HTML.
- **Seed:** `seedView05Reviews` seeds six Amara T. reviews with distinct reviewer identities, one edited review, and one provider reply (`SEED_VIEW_05_*` constants for e2e).
- **Assumption:** Submit/edit/delete/reply write paths and domain events remain scoped to US-REV-* stories; VIEW-05 only delivers the public read surface and profile embedding per FR-REV-03/04/06 display requirements.
- **Tests:** `serializers.test.ts`, `provider-reviews.integration.test.ts` (TC-VIEW-05a/b), extended `provider-profile-view.integration.test.ts`, `testing/playwright/profile-reviews.e2e.ts`.

### Verification 2026-09-05

- `npm run check` — 0 errors (5 pre-existing Svelte warnings).
- `npm run lint` — clean.
- `npm run test` — 183/183 passed.
- `npm run test:e2e -- profile-reviews.e2e.ts` — 2/2 passed (axe clean on reviews section).
- Adversarial: `curl -s http://127.0.0.1:5173/api/reviews/provider/not-a-uuid` returned `NOT_FOUND` / 404.
