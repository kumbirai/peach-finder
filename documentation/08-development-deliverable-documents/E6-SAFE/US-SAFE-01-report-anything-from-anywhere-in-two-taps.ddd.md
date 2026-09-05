---
title: DDD — US-SAFE-01 — Report anything, from anywhere, in two taps
updated: 2026-09-04
---

# US-SAFE-01 — Report anything, from anywhere, in two taps

**Epic:** Stay safe: report & block (SAFE) — `user-stories.md` §9
**Priority:** M

## 1. Story

As a signed-in user, I want to report a profile, review, photo, or message thread from wherever I'm looking at it, so that escalation never requires hunting.

## 2. Acceptance criteria

- Report is reachable from every profile and every conversation in one–two taps.
- The flow offers exactly the reason taxonomy: *safety concern, fake profile/photos, harassment, spam/scam, other* (+ free text), and confirms receipt in-app.
- Filing a report triggers **no automated action** against the reported party — consequences are exclusively human decisions (E13).

## 3. Traces

FR-TRUST-07, FR-MSG-05, FR-NOTIF-01.

## 4. Build blueprint

**Primary LLD module:** `trust-and-safety` (`../../05-low-level-design/07-trust-and-safety/trust-and-safety-lld.md`)
**Supporting modules:** `direct-messaging` (`../../05-low-level-design/05-direct-messaging/direct-messaging-lld.md`); `user-notifications` (`../../05-low-level-design/11-user-notifications/user-notifications-lld.md`)

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
- `07-test-artifacts/04-traceability-matrix.md` row for US-SAFE-01 cross-references this DDD (applied in the stage-9 traceability pass).

## 7. Implementation Notes

**Date:** 2026-09-05

### Approach

- **Shared report taxonomy** — `src/lib/safety/report-flow.ts` centralises FR-TRUST-07 reason options, profile/thread success copy, and label helpers; consumed by profile report UI, `ThreadSafetyPanel`, and tests.
- **Profile report surface** — New route `src/routes/provider/[id]/report/` (seeker role) with `ReportReasonForm.svelte`: one tap from profile actions (`Report` link) lands on the reason picker; selecting a non-`other` reason auto-submits (two taps total). `other` reveals optional free text plus explicit submit.
- **Thread report surface** — `ThreadSafetyPanel.svelte` reuses the shared taxonomy; non-`other` reasons auto-submit on selection (MSG-06 thread header menu unchanged). Reachability: safety menu toggle → Report button (two taps).
- **Navigation/auth** — `profile-action-hrefs.ts` routes signed-in seekers directly to `/provider/{id}/report`; `post-auth-redirect.ts` honours `action=report` after sign-in.
- **Backend** — Extended `fileReport` to validate `targetType: 'profile'` via `getPublicProfile`; existing `POST /api/trust/reports` and `ReportFiled` → in-app `report_receipt` notification path from US-MSG-06 reused unchanged. No automated consequence on reported party.
- **Tests** — Unit: `report-flow.test.ts`. Integration: `profile-report.integration.test.ts` (zero-consequence assertions). E2E: `testing/playwright/e2e-report-resolution.e2e.ts` (TC-SAFE-01a/b/c + axe on profile report panel).

### Deviations

- **Review/photo report UI** — API accepts `review` and `photo` target types per LLD; no dedicated review/photo surfaces exist in V1 UI yet. Out of scope for this story's reachable surfaces (profile + thread only).
- **E2E thread setup** — Thread reachability test opens a thread via `POST /api/messaging/threads` (live stack) after email verification, avoiding flaky compose-form `?/send` navigation; aligns with `delete-my-account.e2e.ts` pattern.
- **Admin resolution steps** in `e2e-report-resolution.spec-design.md` remain US-ADMIN-03 scope; this story covers filing + receipt + zero automated consequence only.

### Verification (observed)

| Command | Result |
|---------|--------|
| `npm run check` | PASS (0 errors) |
| `npm run lint` | PASS |
| `npm run test` | PASS — 66 files, 225 tests |
| `npm run test:e2e -- e2e-report-resolution.e2e.ts` | PASS — 5/5 |

### Follow-ups

- Add review/photo report entry points when those surfaces ship.
- `seed-reports` pack (if introduced for US-ADMIN-03) is not required for US-SAFE-01 filing tests (`seed-core` suffices).
