---
title: Peach Finder — Test Artefacts — Test Plan
updated: 2026-09-04
---

# Test Plan — Test Artefacts

## 1. Document Control

| Field | Value |
|---|---|
| Product | Peach Finder |
| Document | Test plan (SDLC stage 8) |
| Upstream | `01-test-strategy.md`, `03-user-stories/user-stories.md` §18 (suggested build order) |
| Status | Living document — updated in place |

## 2. Scope

In scope: every M/S/C-priority story in `user-stories.md` (75 of 76 — the one C-priority story, US-DISC-09 recent-searches, still gets a test case, just lowest scheduling priority). Out of scope: W-priority guards (tested only as negative assertions inside the story whose scope they guard, never as a standalone feature test — see `04-traceability-matrix.md` §3).

## 3. Seed data strategy

Every test case and Playwright design in this stage references one of these named seed packs rather than ad hoc fixtures, so live-stack-seeded execution (per this stage's own Stage 8 rule) is reproducible and the packs can be versioned alongside the schema:

| Pack | Contents | Used by |
|---|---|---|
| `seed-core` | 12 published provider profiles spanning: available-now (mixed recency), not-available, verified, unverified, featured, non-featured, phone-visible ON/OFF, 0/1/5+ reviews, all 5 personas' analogues | Most functional test cases; `e2e-search-to-contact`, `e2e-visual-quality-design-system` |
| `seed-onboarding` | One fresh provider account, draft (unpublished) state, zero profile fields | `e2e-provider-onboarding-publish` |
| `seed-availability` | Providers at each `NotAvailable`/`Available`/`ExpiryWarned` state-machine node, including one at the T-15min boundary and one past `expires_at` awaiting sweep | `03-test-cases/availability-and-discovery.md`, `e2e-availability-lifecycle` |
| `seed-verification` | Providers in each identity-verification state: never-submitted, pending, approved, rejected, approved-then-suppressed (identity-relevant edit) | `03-test-cases/reviews-trust-and-admin.md`, `e2e-identity-verification` |
| `seed-reports` | Open reports across all five FR-TRUST-07 reasons, one already dismissed, one already acted-on, one message-thread report | `e2e-report-resolution` |
| `seed-billing` | Providers at each listing-lifecycle node (Building, FreeListed, PaidListed, Grace, Unpublished) plus one with an active featuring add-on | `03-test-cases/billing-analytics-and-privacy.md`, `e2e-billing-lifecycle` |
| `seed-reviews` | One provider with a thread <24h old (ineligible reviewer), one ≥24h old (eligible), one with an existing review, one review already reported | `e2e-review-lifecycle` |
| `seed-blocking` | Two seeker↔provider pairs, one blocked in each direction, with prior message/review history predating the block | `e2e-block-unblock` |

Seed packs are owned by whichever DDD later implements the seeding script (`08-development-deliverable-documents`); this stage only names and specifies their required contents so the Playwright designs have something concrete to depend on.

## 4. Phased schedule

Mirrors the non-binding build order already agreed in `user-stories.md` §18, so test execution readiness tracks implementation readiness rather than racing ahead of it:

| Phase | Stories/epics | Test artefacts exercised first |
|---|---|---|
| 1 | E3 ACC + E7 PONB (accounts, profiles) | `identity-and-access.md`, `provider-profile-and-media.md` (PONB half) |
| 2 | E8 AVAIL + E1 DISC (availability, discovery — the proposition) | `availability-and-discovery.md`, `e2e-search-to-contact`, `e2e-availability-lifecycle` |
| 3 | E2 VIEW + E4 MSG (profile view, messaging) | `provider-profile-and-media.md` (VIEW half), `messaging-and-notifications.md` (MSG half) |
| 4 | E6 SAFE + E13 ADMIN (safety + admin, before public launch) | `reviews-trust-and-admin.md`, `e2e-report-resolution`, `e2e-block-unblock` |
| 5 | E11 BILL (billing, before free periods start expiring) | `billing-analytics-and-privacy.md` (BILL half), `e2e-billing-lifecycle` |
| 6 | E5 REV, E9 VERIF, E10 ANLY, E12 NOTIF, E14 PRIV (threads woven throughout) | remaining files/designs, plus `e2e-review-lifecycle`, `e2e-identity-verification` |
| Continuous | Visual/perceived-performance quality | `e2e-visual-quality-design-system`, `e2e-performance-and-perceived-quality` run against every phase's surfaces as they land, not deferred to the end |

## 5. Roles & responsibilities

| Role | Responsibility |
|---|---|
| Story implementer | Writes/passes the unit-and-handler-level LLD tests for their module; hands off to QA execution once their story's UI exists in a real environment |
| QA / test execution | Executes `03-test-cases/` against dev/staging; files defects per the severity taxonomy (`01-test-strategy.md` §7) |
| Design-system owner | Approves visual-conformance test-case failures/waivers against `DESIGN.md`; owns the golden screenshots the visual-regression Playwright design diffs against |
| Release gate | CI, per LLD test-strategy §4 — no artefact in this stage overrides that gate, it feeds it |

## 6. Definition of done tie-back

A story is "tested" per `user-stories.md`'s own Definition of Done (§1: FR-UX-02/SR-PERF budgets on reference device, WCAG 2.2 AA, FR-UX-05 error pattern, 360px-first) plus this stage's addition: its `DESIGN.md`-rule visual-conformance row passes. No story exits this stage's testing scope on functional-pass-alone if it ships a visible UI surface.

## 7. Risk register (test-execution-specific)

| Risk | Mitigation |
|---|---|
| Seed packs drift from schema as LLD modules evolve | Seed packs are versioned; a schema migration that breaks a pack's assumptions is caught by the pack's own smoke check before it's trusted for a test run |
| Visual regression baselines rot (legitimate redesign vs. regression indistinguishable) | Baseline screenshots are re-approved explicitly by the design-system owner on every intentional `DESIGN.md`/prototype change, never silently overwritten by a passing CI run |
| Real photography is still absent (per `06-ui-ux-design/README.md` §5) | Visual-regression and card-layout test cases use the documented placeholder treatment consistently, so the regression baseline itself doesn't need to be redone the moment real photography lands — only the placeholder-vs-photo swap needs a targeted re-check |
| Manual-review admin queue (BRD risk #2) makes `seed-verification`/`seed-reports` states hard to reach via UI alone | Seed packs are inserted directly at the data layer, not walked through the admin UI, so test-case execution isn't blocked on admin-console maturity |
