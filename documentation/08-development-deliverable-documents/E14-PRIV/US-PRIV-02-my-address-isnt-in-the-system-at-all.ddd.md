---
title: DDD — US-PRIV-02 — My address isn't in the system at all
updated: 2026-09-04
---

# US-PRIV-02 — My address isn't in the system at all

**Epic:** My data, my contact details (PRIV) — `user-stories.md` §17
**Priority:** M

## 1. Story

As a provider, the platform collects and shows only my area — it has no field for my street address anywhere; precise directions are mine to share in messages when I choose. Photos I upload have EXIF/GPS stripped so my studio can't be located from metadata.

## 2. Acceptance criteria

No dedicated acceptance-criteria list in `user-stories.md` §17 for this story — behavior is fully specified by the story statement above and the traces below.

## 3. Traces

FR-PROF-04, FR-PRIV-02, SR-MEDIA-03.

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
- `07-test-artifacts/04-traceability-matrix.md` row for US-PRIV-02 cross-references this DDD (applied in the stage-9 traceability pass).
- No application code exists yet for this story; this document is the blueprint an implementer builds from, not the implementation.

## 7. Implementation Notes

### Session 2026-09-05 — feat/initial-implementation — Cursor Composer (US-PRIV-02)

- **Scope:** US-PRIV-02 formalizes privacy-by-construction for provider location (area-only, no street address anywhere) and EXIF/GPS stripping on photo upload (SR-MEDIA-03). Core behaviour was introduced in US-PONB-03 (area step, media pipeline) and US-DISC-05 (transient seeker coords); this story adds regression coverage and surfaces the area-only privacy copy on provider registration.
- **Backend:** No schema or API changes — `provider_profile.area_id` remains the finest location granularity (LLD §3.4); `toPublicProfile` exposes `{ name, slug }` area only. `media-processing` pipeline already strips metadata unconditionally (no `.withMetadata()` in infra).
- **Frontend:** Added area-only privacy hint on `/provider/register` matching onboarding copy. Onboarding area step already had the StepTip (US-PONB-03).
- **Tests:** `address-privacy.integration.test.ts` (TC-PRIV-02a schema + API audit), `exif-privacy.integration.test.ts` (TC-PRIV-02b full upload pipeline with geotagged fixture), enhanced `process-photo.test.ts` with `createGeotaggedJpegFixture`, `serializers.test.ts` area-only assertion, `testing/playwright/provider-address-privacy.e2e.ts` (TC-PRIV-02a/b live-stack + axe on register/onboarding area step).
- **Assumption:** TC-PRIV-02b cross-references TC-PONB-03c — both assert the same EXIF strip invariant; US-PRIV-02 adds geotagged-source regression and E2E verification at the HTTP boundary.

### Verification 2026-09-05

- `npm run check` — 0 errors (5 pre-existing Svelte warnings).
- `npm run lint` — clean.
- `npm run test` — 149/149 unit tests passed.
- `npm run test:integration -- address-privacy exif-privacy` — 3/3 passed (TC-PRIV-02a schema/API, TC-PRIV-02b upload pipeline).
- `npm run test:e2e -- provider-address-privacy.e2e.ts` — 3/3 passed (TC-PRIV-02a UI/API, TC-PRIV-02b live EXIF strip, axe on register + onboarding area step).
