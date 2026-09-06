---
title: DDD — US-ANLY-02 — Aggregate always, identifiable never
updated: 2026-09-04
---

# US-ANLY-02 — Aggregate always, identifiable never

**Epic:** Understand how I'm found (ANLY) — `user-stories.md` §13
**Priority:** M

## 1. Story

As a seeker (protected party), analytics must never let a provider see who viewed or searched; counts below the floor display as "< 5".

## 2. Acceptance criteria

No dedicated acceptance-criteria list in `user-stories.md` §13 for this story — behavior is fully specified by the story statement above and the traces below.

## 3. Traces

FR-ANLY-03, FR-PRIV-06, SR-APP-08.

## 4. Build blueprint

**Primary LLD module:** `provider-analytics` (`../../05-low-level-design/10-provider-analytics/provider-analytics-lld.md`)

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
- `07-test-artifacts/04-traceability-matrix.md` row for US-ANLY-02 cross-references this DDD (applied in the stage-9 traceability pass).
- No application code exists yet for this story; this document is the blueprint an implementer builds from, not the implementation.

## 7. Implementation Notes

**Approach:** US-ANLY-02 privacy rules were implemented on top of the US-ANLY-01 `provider-analytics` module: `formatCount` in `infra/serializers.ts` is the single read-time floor (counts 0–4 render as `"< 5"`); `dashboard-read.ts` caches raw counts and re-applies the floor at serialize time per LLD §7; `ProviderAnalyticsSection.svelte` displays only floored aggregate strings; `sparklineValueFromTrendLabel` maps `"< 5"` to a fixed band so trend charts never reveal 1–4. Added `domain/analytics-privacy-contract.ts` with `assertAggregateOnlyPayload` to guard against seeker-identifying keys in provider-facing payloads. Tests: unit (`serializers.test.ts`, `analytics-privacy-contract.test.ts`, `provider-analytics-display.test.ts`), integration (`TC-ANLY-02a` aggregate-only assertion, `TC-ANLY-02b` floor at read time + cache re-apply), Playwright (`provider-analytics.e2e.ts` US-ANLY-02 describe with live-seeded `privacy-floor` scenario via `/api/dev/analytics-seed?scenario=privacy-floor`).

**Deviation:** None — floor at zero deliberately returns `"< 5"` per LLD §11 open question #4 (never reveal "exactly nobody viewed you").

**Follow-ups:** US-ANLY-03 demand-signal highlighting refinements; US-ANLY-04 chart event annotations; US-PRIV-03d raw-event purge integration test at 90-day boundary.
