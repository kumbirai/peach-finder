---
title: DDD — US-ADMIN-06 — Tune the platform without a deploy
updated: 2026-09-04
---

# US-ADMIN-06 — Tune the platform without a deploy

**Epic:** Keep the platform honest (admin) (ADMIN) — `user-stories.md` §16
**Priority:** M

## 1. Story

As an admin, I want to edit: free-period length, availability expiry + reminder lead, "highly rated" threshold, response-time window, service-tag vocabulary, search lexicon, and pricing — effective ≤ 5 minutes, no deployment.

## 2. Acceptance criteria

No dedicated acceptance-criteria list in `user-stories.md` §16 for this story — behavior is fully specified by the story statement above and the traces below.

## 3. Traces

FR-ADM-06, FR-MONET-07, SR-APP-11.

## 4. Build blueprint

**Primary LLD module:** `platform-configuration` (`../../05-low-level-design/13-platform-configuration/platform-configuration-lld.md`)

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
- `07-test-artifacts/04-traceability-matrix.md` row for US-ADMIN-06 cross-references this DDD (applied in the stage-9 traceability pass).
- No application code exists yet for this story; this document is the blueprint an implementer builds from, not the implementation.

## 7. Implementation Notes

**Date:** 2026-09-06

**Approach:** Platform-configuration backend (config CRUD, lexicon CRUD, `ConfigChanged` cache invalidation) was already in place from foundation/W4 predecessors. This story delivered the admin console delivery surface at `/admin/config` with sectioned forms for every FR-ADM-06-editable config key, service-tag vocabulary management, and search lexicon management. Service-tag admin CRUD lives in `provider-profile` (`adminCreateServiceTag`, `adminUpdateServiceTag`, `adminRetireServiceTag`) per LLD §5.3, exposed at `/admin/api/provider/service-tags`. Config saves use existing `PUT /admin/api/platform/config/:key` semantics via form actions that call `updateConfig` (audit + outbox `ConfigChanged` in one transaction).

**Endpoints:** `GET/PUT /admin/api/platform/config[/:key]`; `GET/POST /admin/api/platform/lexicon`, `PUT /admin/api/platform/lexicon/:id`; `GET/POST /admin/api/provider/service-tags`, `PATCH/DELETE /admin/api/provider/service-tags/:id`.

**Tests:** Unit `platform-config-fields.test.ts`, `config-registry.test.ts`; integration `update-config.integration.test.ts` (TC-ADMIN-06a/b), `admin-service-tags.integration.test.ts`; Playwright `testing/playwright/platform-config.e2e.ts` (live-stack-seeded, axe gate on `/admin/config`).

**Deviations:** No dedicated platform-config panel exists in the static prototype — UI follows established admin console patterns (Ink strip, section cards, design-system `Input`/`Button`, warm shadows, Terracotta focus rings). `provider-availability.active_week_window_days` is shown read-only per LLD §4 (not FR-ADM-06-editable).
