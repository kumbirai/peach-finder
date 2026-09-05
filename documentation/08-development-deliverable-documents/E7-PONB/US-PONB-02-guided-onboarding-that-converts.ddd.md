---
title: DDD — US-PONB-02 — Guided onboarding that converts
updated: 2026-09-05
---

# US-PONB-02 — Guided onboarding that converts

**Epic:** Become a provider & build my profile (PONB) — `user-stories.md` §10
**Priority:** S

## 1. Story

As a new provider, I want a resumable checklist — photos → intro → services → languages → location → publish — with per-step guidance, so that I build a profile that actually gets contacts.

## 2. Acceptance criteria

- Checklist shows progress, is resumable across sessions, and offers per-step conversion guidance (photo quality tips, intro examples).
- Publish-readiness is a visible checklist driven by the minimum field set.

## 3. Traces

FR-UX-07, FR-PROF-02.

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
- `07-test-artifacts/04-traceability-matrix.md` row for US-PONB-02 cross-references this DDD (applied in the stage-9 traceability pass).
- Implementation complete on `feat/initial-implementation` (uncommitted; driver owns commits).

## 7. Implementation Notes

### Session 2026-09-05 — feat/initial-implementation — Cursor Composer

**Approach:** Replaced the US-PONB-01 read-only checklist placeholder with a six-step onboarding wizard at `/provider/onboarding` (photos → intro → services → languages → area → publish), matching the prototype stepper layout and per-step conversion tips. Server-driven resumability uses `firstIncompleteOnboardingStep` / `computePublishReadiness` from `provider-profile/domain/publish-readiness.ts`; the active step is overridable via `?step=` while still defaulting to the first incomplete step on return. Extended `loadOwnerProfile` with gallery, services, languages, tags, and area name for the review step.

**Backend:** Added `profile-commands.ts` with `updateIntro`, `updateArea`, `addService`, `setLanguages`, `setServiceTags`, and `attachOnboardingPhoto` (creates `media_processing.photo` + `provider_photo` rows with placeholder URLs — interim until US-PONB-03 wires real upload/processing). API routes: `PATCH /api/provider/profile`, `PUT …/area`, `POST …/services`, `PUT …/languages`, `PUT …/tags`, `POST …/photos`, `GET /api/provider/languages`, `GET /api/provider/service-tags`. Form actions on the onboarding page mirror the same commands for progressive enhancement. `ProfileUpdated` / `PhotoAdded` outbox events published on writes.

**Frontend:** `OnboardingStepper.svelte`, `StepTip.svelte`, design-system `Button`/`Chip`/`Card` tokens; dashboard "Continue setup" links to onboarding. Publish step shows review rows plus a plain-language blocked message listing missing minimum fields (`formatMissingFields`).

**Tests:** Unit (`intro-policy`, `service-policy`, existing `publish-readiness`); integration `guided-onboarding.integration.test.ts` (TC-PONB-02a/b logic); E2E `testing/playwright/provider-onboarding-guided.e2e.ts` (TC-PONB-02a/b + axe). Verified: `check`, `lint`, `test` (82), `test:integration` (26), `boundaries`, `build`, onboarding + register E2E (6/6).

**Deviations:** Photo attach uses placeholder image URLs and synchronous ready status (no `media-processing` upload pipeline) — sufficient for onboarding progress/readiness until US-PONB-03. Actual publish action remains US-PONB-04; publish step ends with "Finish setup" → dashboard when readiness passes. `?step=publish` is allowed before all essentials are complete so providers can inspect the readiness gate (TC-PONB-02b).

**Follow-ups:** US-PONB-03 replaces placeholder photo attach with real upload/EXIF strip; US-PONB-04 adds `POST …/publish` and live listing.
