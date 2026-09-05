---
title: DDD — US-VIEW-03 — Contact actions where my thumb is
updated: 2026-09-04
---

# US-VIEW-03 — Contact actions where my thumb is

**Epic:** Judge a provider from their profile (VIEW) — `user-stories.md` §5
**Priority:** M

## 1. Story

As a seeker who's decided, I want Message (and Call, when the provider allows it) as prominent sticky actions, so that deciding and acting are the same moment.

## 2. Acceptance criteria

- Message is the primary action, sticky on the profile screen at mobile sizes; tapping it as an anonymous user routes through the US-ACC-02 continuity flow.
- Call appears with a tap-to-call number if (provider has phone visibility ON) or (I am a signed-in seeker); otherwise no number appears anywhere in the served markup (server-side hiding, FR-PRIV-01).

## 3. Traces

FR-PROF-07, FR-PROF-08, FR-PRIV-01, FR-UX-01.

## 4. Build blueprint

**Primary LLD module:** `provider-profile` (`../../05-low-level-design/02-provider-profile/provider-profile-lld.md`)
**Supporting modules:** `identity-and-access` (`../../05-low-level-design/01-identity-and-access/identity-and-access-lld.md`)

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
- `07-test-artifacts/04-traceability-matrix.md` row for US-VIEW-03 cross-references this DDD (applied in the stage-9 traceability pass).
- No application code exists yet for this story; this document is the blueprint an implementer builds from, not the implementation.

## 7. Implementation Notes

### Session 2026-09-05 — feat/initial-implementation — Cursor Composer (US-VIEW-03)

- **Backend:** Added `resolveProfileActionHrefs` in `identity-and-access` so signed-in seekers get a direct `/messages/compose/:id` link while anonymous viewers still route through `gatedActionHref` (US-ACC-02 continuity). Phone visibility for Call remains server-side via existing `toPublicProfile` serializer (US-PRIV-01).
- **Frontend:** Split profile contact UI to match prototype — `ProfileSafetyActions` (Review/Report/Block below header) and sticky `ProfileContactBar` (Call + personalised primary Message CTA) with mobile bottom-nav offset (`bottom: calc(58px + safe-area)`), flex-1 buttons, and warm-sheet shadow. Extracted `contact-actions.ts` helpers (`resolveCallHref`, `messageButtonLabel`).
- **Tests:** `contact-actions.test.ts`, `profile-action-hrefs.test.ts`, `provider-profile-view.integration.test.ts` (TC-VIEW-03b), Playwright TC-VIEW-03a/b in `search-to-contact.e2e.ts`; updated browse-anonymous/sign-up-mid-action selectors for personalised Message label.

### Verification 2026-09-05

- `npm run check` — 0 errors (5 pre-existing Svelte warnings).
- `npm run lint` — clean.
- `npm run test` — 174/174 passed.
- `npm run test:integration -- provider-profile-view` — 2/2 passed.
- `npm run test:e2e -- search-to-contact.e2e.ts` — 11/11 passed (TC-VIEW-03a/b, axe clean).
- `npm run test:e2e -- browse-anonymous.e2e.ts sign-up-mid-action.e2e.ts` — 6/7 passed (TC-ACC-01a pre-existing `zulu`→`lang=zu` parser behaviour unrelated to this story; TC-ACC-01b and all US-ACC-02 tests green).
