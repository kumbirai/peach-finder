---
title: DDD — US-ADMIN-07 — Everything I do is on the record
updated: 2026-09-04
---

# US-ADMIN-07 — Everything I do is on the record

**Epic:** Keep the platform honest (admin) (ADMIN) — `user-stories.md` §16
**Priority:** M

## 1. Story

As the platform owner, every admin action (approvals, rejections, removals, suspensions, config changes) writes who/what/whom/when/reason to an append-only audit log no application path can edit or delete.

## 2. Acceptance criteria

No dedicated acceptance-criteria list in `user-stories.md` §16 for this story — behavior is fully specified by the story statement above and the traces below.

## 3. Traces

FR-ADM-08, SR-DATA-05.

## 4. Build blueprint

**Primary LLD module:** `moderation-admin` (`../../05-low-level-design/08-moderation-admin/moderation-admin-lld.md`)
**Foundations cited:** `00-foundations/shared-kernel.md` §7 (append-only `shared.audit_log`).

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
- `07-test-artifacts/04-traceability-matrix.md` row for US-ADMIN-07 cross-references this DDD (applied in the stage-9 traceability pass).
- No application code exists yet for this story; this document is the blueprint an implementer builds from, not the implementation.

## 7. Implementation Notes

**Approach (2026-09-06):** Audit writes were already in place across owning modules via `shared/audit.ts` `writeAudit` (SR-DATA-05 append-only enforced at DB level). This story added the read path and admin delivery surface:

- **Backend:** `platform-configuration.readAuditLog` in `src/lib/server/modules/platform-configuration/infra/read-audit-log.ts` — cursor-paginated SELECT over `shared.audit_log` filtered by `targetType` + `targetId`, with actor display names resolved via `identity-and-access.getDisplayIdentity`. Exposed at `GET /admin/api/audit?targetType=&targetId=&cursor=&limit=`.
- **Frontend:** `/admin/audit` read-only viewer (filter form, entry cards with who/what/whom/when/reason, load-more pagination). Linked from `AdminNav`, admin home, and account lookup (`View audit trail` / `View profile audit trail`).
- **Tests:** `audit-log.integration.test.ts` (TC-ADMIN-07a complete fields, TC-ADMIN-07b DB append-only), `testing/playwright/admin-audit-log.e2e.ts` (live-stack TC-ADMIN-07a/b + axe). Updated `admin-console.e2e.ts` nav assertion for Audit log tab.

**Deviations:** None.

**Follow-ups:** None for this story; US-ADMIN-08 ops KPI dashboard is the next admin epic item.
