---
title: DDD — US-PONB-03 — Build the profile itself
updated: 2026-09-04
---

# US-PONB-03 — Build the profile itself

**Epic:** Become a provider & build my profile (PONB) — `user-stories.md` §10
**Priority:** M

## 1. Story

As a provider, I want to add 1–12 photos, a short intro, services with duration and price, curated service tags, and languages, so that my profile sells me.

## 2. Acceptance criteria

- Gallery: 1–12 photos, first is primary, reorderable; uploads validated technically only (type/size ≤ 10 MB/decodability) — **never content-reviewed**; EXIF/GPS stripped on upload (invisible to me, verified in tests).
- Intro capped ~600 chars with live count; services structured (name, optional description, duration, price); tags selected from the curated vocabulary — I can propose a missing tag, and my profile is never blocked on the outcome.
- Location is area/suburb granularity only; the UI never asks for a street address.

## 3. Traces

FR-PROF-01, FR-PROF-03, FR-PROF-04, SR-MEDIA-02/03.

## 4. Build blueprint

**Primary LLD module:** `provider-profile` (`../../05-low-level-design/02-provider-profile/provider-profile-lld.md`)
**Supporting modules:** `media-processing` (`../../05-low-level-design/12-media-processing/media-processing-lld.md`)

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
- `07-test-artifacts/04-traceability-matrix.md` row for US-PONB-03 cross-references this DDD (applied in the stage-9 traceability pass).
- No application code exists yet for this story; this document is the blueprint an implementer builds from, not the implementation.

## 7. Implementation Notes

### 2026-09-05 — Cursor Composer

**Approach:** Replaced US-PONB-02 photo placeholder with a full `media-processing` pipeline (sharp variants, EXIF strip, 10 MB / 12-photo caps) and `provider-profile` photo commands (attach, reorder, primary, delete) wired through API routes, worker subscriptions (`MediaProcessed` / `MediaRemoved`), and `PhotoUploader.svelte` on the onboarding wizard. Added `service_tag_proposal` table + `proposeTag` server action. Migration `0005_us_ponb_03_profile_media.sql`.

**Storage:** Dev/test uses local filesystem under `MEDIA_LOCAL_ROOT` (default `.media-local`); MinIO client deferred — same public URL shape via `/media/[...path]`.

**UI fixes discovered in E2E:** Photos-step Continue uses `href` (client `goto` unreliable under Playwright); tag proposal uses separate `?/proposeTag` form with redirect flash query params; languages step uses native checkbox chips (`:has(:checked)` styling) so form POST works without client onclick.

**Tests:** `media-processing/domain/upload-policy.test.ts`, `media-processing/infra/process-photo.test.ts` (TC-PONB-03c EXIF), `provider-profile/profile-media.integration.test.ts`, `e2e/provider-profile-build.e2e.ts` (TC-PONB-03a–f + axe). Updated `e2e/provider-onboarding-guided.e2e.ts` for real uploads.

**Verified:** `npm run check` (0 errors), `npm run lint`, `npm run test` (87), `npm run test:integration` (33), `npm run boundaries`, `npm run build`, E2E PONB-02/03 specs (7/7 with `CI=1`).

**Follow-ups:** Wire MinIO in `media-processing/infra/storage.ts` for production parity; content-hash dedup rejects identical re-uploads at DB level (by design per LLD).

### 2026-09-05 — Cursor Composer (verification pass)

**Fixes:** OTP rate-limit phone hourly/daily buckets now use distinct keys (`phone_hour:` / `phone_day:`) so colliding `window_start` at UTC midnight no longer double-counts; `profile-media.integration.test.ts` guards `otpId` before verify; tag-proposal form uses `use:enhance` and renders `data.proposalFlash` directly so TC-PONB-03e status message appears after redirect.

**Verified:** `npm run check`, `npm run lint`, `npm run test` (87), `npm run test:integration` (33), `npm run boundaries`, `npm run build`, E2E PONB-02/03 (7/7, `CI=1`).
