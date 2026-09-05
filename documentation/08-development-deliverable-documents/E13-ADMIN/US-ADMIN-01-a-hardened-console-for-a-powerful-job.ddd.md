---
title: DDD — US-ADMIN-01 — A hardened console for a powerful job
updated: 2026-09-04
---

# US-ADMIN-01 — A hardened console for a powerful job

**Epic:** Keep the platform honest (admin) (ADMIN) — `user-stories.md` §16
**Priority:** M

## 1. Story

As an admin, I want a dedicated, access-restricted console (TOTP 2FA mandatory, ≤ 12 h idle timeout) housing the identity queue, reports queue, account lookup, moderation actions, and platform config, so that admin power is usable and locked down.

## 2. Acceptance criteria

No dedicated acceptance-criteria list in `user-stories.md` §16 for this story — behavior is fully specified by the story statement above and the traces below.

## 3. Traces

FR-ADM-01, SR-SEC-08.

## 4. Build blueprint

**Primary LLD module:** `moderation-admin` (`../../05-low-level-design/08-moderation-admin/moderation-admin-lld.md`)
**Supporting modules:** `platform-configuration` (`../../05-low-level-design/13-platform-configuration/platform-configuration-lld.md`)

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
- `07-test-artifacts/04-traceability-matrix.md` row for US-ADMIN-01 cross-references this DDD (applied in the stage-9 traceability pass).
- Implementation complete — see section 7.

## 7. Implementation Notes

**Date:** 2026-09-06

**Approach:** Admin console is a delivery surface under `src/routes/admin/`; authentication and TOTP live in `identity-and-access`. Password login issues a signed `pf_admin_challenge` cookie (no session until TOTP succeeds). Enrolled admins verify TOTP; first-time admins complete inline enrollment. Admin sessions use a 12 h idle timeout (`ADMIN_SESSION_IDLE_MS`). Console shell exposes section nav (identity queue, reports, accounts, moderation, platform config) with Ink strip scoped to `/admin/*`. Seed pre-enrolls `admin@example.com` TOTP for live-stack E2E.

**Endpoints:** `POST /admin/api/identity/login`, `POST /admin/api/identity/login/totp`; dev helpers `GET /api/dev/admin-totp-code` and `devTotpCode` on login response when `ALLOW_DEV_HELPERS=1`.

**Tests:** Unit (`domain/totp.test.ts`), integration (`admin-console.integration.test.ts`), Playwright (`testing/playwright/admin-console.e2e.ts` — TC-ADMIN-01a, TC-ADMIN-VIS-01, section nav, axe on login).

**Deviations:** Queue/action pages are placeholders — this story delivers the hardened shell and auth gate; downstream admin stories fill each section. Primary LLD module is `moderation-admin` for future queue work; no moderation-admin domain code in this story.
