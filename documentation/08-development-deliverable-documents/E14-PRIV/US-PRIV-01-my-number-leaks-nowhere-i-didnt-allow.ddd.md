---
title: DDD — US-PRIV-01 — My number leaks nowhere I didn't allow
updated: 2026-09-04
---

# US-PRIV-01 — My number leaks nowhere I didn't allow

**Epic:** My data, my contact details (PRIV) — `user-stories.md` §17
**Priority:** M

## 1. Story

As a provider, my phone number appears to anonymous visitors only when I've switched visibility ON — and when OFF it is absent from the served markup, not hidden by CSS.

## 2. Acceptance criteria

No dedicated acceptance-criteria list in `user-stories.md` §17 for this story — behavior is fully specified by the story statement above and the traces below.

## 3. Traces

FR-PRIV-01, FR-PROF-08, SR-SEC-09.

## 4. Build blueprint

**Primary LLD module:** `provider-profile` (`../../05-low-level-design/02-provider-profile/provider-profile-lld.md`)
**Foundations cited:** `00-foundations/security-implementation.md` §7 (server-side privacy-filtering serializers).

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
- `07-test-artifacts/04-traceability-matrix.md` row for US-PRIV-01 cross-references this DDD (applied in the stage-9 traceability pass).
- No application code exists yet for this story; this document is the blueprint an implementer builds from, not the implementation.

## 7. Implementation Notes

### Session 2026-09-05 — feat/initial-implementation — Cursor Composer (US-PRIV-01)

- **Scope:** US-PRIV-01 formalizes the server-side phone-visibility privacy guarantee (FR-PRIV-01, SR-SEC-09) already introduced in US-PONB-07. No new product surface — the story adds regression coverage proving the number is absent from served JSON/HTML at the network layer, not merely hidden in CSS.
- **Serializer:** `toPublicProfile` in `serializers.ts` omits the `phone` key entirely via conditional spread when `phoneVisible=false` and viewer is anonymous. Unit test now asserts `'phone' in dto === false` and `JSON.stringify` absence (test-strategy §2.2 bug class).
- **Integration:** `phone-privacy.integration.test.ts` covers TC-PRIV-01a across `getPublicProfile`, `runSearch` cards, and `getProfilePreviewForOwner` anonymous preview — all assert key absence and no `+27` digits in serialized output.
- **E2E:** `testing/playwright/search-to-contact.e2e.ts` (traceability `e2e-search-to-contact`) verifies TC-PRIV-01a at API, SSR HTML, homepage, and discovery-search layers using `seed-core` (Thandi M. phone-OFF vs Amara T. phone-ON). Includes partial golden-path (homepage → profile → sign-up mid-action with draft preserved).
- **Seed exports:** `SEED_CORE_PHONE_OFF_PROFILE_ID`, `SEED_CORE_PHONE_OFF_NUMBER`, `SEED_CORE_PHONE_OFF_DISPLAY_NAME`, `SEED_CORE_PHONE_ON_NUMBER` added to `scripts/seed-core.ts` for stable E2E assertions.
- **Assumption:** Signed-in seekers continue to see phone when visibility is OFF (FR-PROF-08) — unchanged from US-PONB-07; US-PRIV-01 only guards anonymous-facing leakage.

### Verification 2026-09-05

- `npm run check` — 0 errors (5 pre-existing Svelte warnings).
- `npm run lint` — clean.
- `npm run test` — 148/148 unit tests passed.
- `npm run test:integration -- phone-privacy.integration.test.ts` — 4/4 passed (TC-PRIV-01a).
- `npx playwright test search-to-contact.e2e.ts` — 4/4 passed (TC-PRIV-01a API/SSR/homepage/search + profile Call link + axe).
- Test-file renames: `auth-commands.test.ts` and `badge-read.test.ts` moved to `*.integration.test.ts` (they already used `withTestDatabase`; vitest unit config excludes `*.integration.test.ts`).
