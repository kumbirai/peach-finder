---
title: Peach Finder — Test Artefacts — Overview
updated: 2026-09-04
---

# Test Artefacts — Overview

## 1. Document Control

| Field | Value |
|---|---|
| Product | Peach Finder |
| Document | Test Artefacts (SDLC stage 8) — index |
| Owner | Kumbirai (kumbirai@gmail.com) |
| Upstream | `03-user-stories/user-stories.md` (76 stories, acceptance criteria), `01-.../frs.md`, `02-.../srs.md`, `00-.../brd.md`, `05-low-level-design/14-test-strategy/test-strategy.md` (dev-facing module test matrix — this stage does not repeat it), `06-ui-ux-design/` (design system + prototype) |
| Downstream | `08-development-deliverable-documents` (DDDs synthesize against the test cases here) |
| Status | Living document — updated in place |

**What this stage is:** the QA-facing test artefacts — strategy, plan, enumerated test cases, and traceability — that sit between the completed UI/UX design system and the (not-yet-started) development deliverable documents. It answers *what gets tested, against which requirement, and how it's proven* — distinct from `14-test-strategy.md` in the LLD, which is the *developer*-facing module-by-module unit/integration test matrix. This stage does not restate that matrix; it cross-references it.

**Driving mission for this stage:** Peach Finder's stated goal is to be a top-10 app in its category on visual look, premium feel, and flawless usability (see `PRODUCT.md`, `DESIGN.md`). Functional correctness is necessary but not sufficient — this stage treats visual/interaction quality and perceived performance as first-class, gating quality pillars (§`01-test-strategy.md` §2), not a footnote. Two of the eleven Playwright designs in `05-playwright-spec-designs/` exist purely to hold that line.

## 2. Contents

| File | Covers |
|---|---|
| `01-test-strategy.md` | Quality pillars, test levels, environments/tooling, entry/exit criteria, risk-based prioritization, defect severity |
| `02-test-plan.md` | Scope, phased schedule, seed-data strategy, roles, definition of done tie-back |
| `03-test-cases/identity-and-access.md` | US-ACC-01..05 (5 stories) |
| `03-test-cases/provider-profile-and-media.md` | US-PONB-01..08, US-VIEW-01..06 (14 stories) |
| `03-test-cases/availability-and-discovery.md` | US-AVAIL-01..05, US-DISC-01..09 (14 stories) |
| `03-test-cases/messaging-and-notifications.md` | US-MSG-01..06, US-NOTIF-01..04 (10 stories) |
| `03-test-cases/reviews-trust-and-admin.md` | US-REV-01..06, US-SAFE-01..03, US-VERIF-01..03, US-ADMIN-01..08 (20 stories) |
| `03-test-cases/billing-analytics-and-privacy.md` | US-BILL-01..05, US-ANLY-01..04, US-PRIV-01..04 (13 stories) |
| `04-traceability-matrix.md` | BR → FR → SR → US → TC coverage, gap check |
| `05-playwright-spec-designs/` | 11 live-stack-seeded E2E designs (8 critical-path journeys + 2 visual/perceived-quality) |

## 3. Clustering rationale

Test cases are grouped by the same six coupling clusters the LLD's parallel-authorship passes used (see Memento `peach-finder [decision, 2026-07-23]`), not one file per epic — this keeps related domain behavior (e.g. profile-building and profile-viewing, or availability and the discovery ranking it feeds) reviewable together, and mirrors a structure the team already recognizes from the LLD set.

## 4. Conventions

- **Test case ID:** `TC-<EPIC>-<NN>`, one epic code per story epic (matches `US-<EPIC>-<NN>` exactly so a story's tests are grep-able by its own ID prefix).
- **Priority:** inherited from the story's own MoSCoW priority (§22 of `user-stories.md`'s convention).
- **Traces:** every test case cites the `US-` ID(s) it verifies and, transitively, the `FR-`/`SR-`/`BR-` IDs those stories already cite — no new requirement IDs are invented at this layer.
- **Visual & interaction quality:** called out as its own row/column within a cluster where the story is UI-facing, checked against the named rules in `DESIGN.md` (Two-Hue Rule, Never-Color-Alone Rule, Warm Shadow Rule, pill-shape rule, 44px touch targets) rather than a vague "looks good" — see `01-test-strategy.md` §2.3.
- **No stub-based E2E.** Per this stage's own rule (`05-playwright-spec-designs/00-index.md`), every Playwright design commits to live-stack-seeded execution now, so the eventual `.spec.ts` (written at DDD/implementation time) has no stub path to silently fall back to.
