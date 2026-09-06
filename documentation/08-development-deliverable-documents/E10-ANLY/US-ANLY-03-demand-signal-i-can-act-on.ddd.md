---
title: DDD — US-ANLY-03 — Demand signal I can act on
updated: 2026-09-04
---

# US-ANLY-03 — Demand signal I can act on

**Epic:** Understand how I'm found (ANLY) — `user-stories.md` §13
**Priority:** M

## 1. Story

As a provider, I want the platform-wide most-searched service tags with my own offered tags highlighted, so that I can spot demand I'm not serving ("sports massage is trending; you don't offer it").

## 2. Acceptance criteria

No dedicated acceptance-criteria list in `user-stories.md` §13 for this story — behavior is fully specified by the story statement above and the traces below.

## 3. Traces

FR-ANLY-04.

## 4. Build blueprint

**Primary LLD module:** `provider-analytics` (`../../05-low-level-design/10-provider-analytics/provider-analytics-lld.md`)
**Supporting modules:** `provider-profile` (`../../05-low-level-design/02-provider-profile/provider-profile-lld.md`)

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
- `07-test-artifacts/04-traceability-matrix.md` row for US-ANLY-03 cross-references this DDD (applied in the stage-9 traceability pass).
- No application code exists yet for this story; this document is the blueprint an implementer builds from, not the implementation.

## 7. Implementation Notes

**Approach:** Completed FR-ANLY-04 demand-signal highlighting on the existing `provider-analytics` dashboard path: `domain/demand-signal.ts` (`highlightOwnServiceTags`, `demandTagOwnershipLabel`) intersects platform-wide `search_filter_applied` top-N ranks with the viewing provider's tags via `provider-profile.listServiceTagIdsForProfileDb` (no cross-schema join for ownership). `infra/dashboard-read.ts` uses the domain helper when serializing `mostSearchedServices`. `ProviderAnalyticsSection.svelte` adds a "Demand signals you can act on" panel with text ownership labels (Never-Color-Alone: pine + "Your tag" vs terracotta + "Not on your profile") and rank list. Fixed dual-role seed to insert `provider_service_tag` (Swedish only) so `isMine` is accurate. Dev seed endpoint `/api/dev/analytics-seed?scenario=demand-signal` seeds ranked filter events for Playwright. Tests: unit (`demand-signal.test.ts`, `provider-analytics-display.test.ts`), integration (`TC-ANLY-03a`), Playwright (`provider-analytics.e2e.ts` US-ANLY-03 describe).

**Deviation:** None.

**Follow-ups:** US-ANLY-04 chart event annotations; US-PRIV-03d raw-event purge integration test at 90-day boundary.
