---
title: Peach Finder — Playwright Spec Designs — Index
updated: 2026-09-04
---

# Playwright Spec Designs — Index & Execution Contract

## Document Control

| Field | Value |
|---|---|
| Upstream | `01-test-strategy.md` §3; `05-low-level-design/14-test-strategy/test-strategy.md` §3 (the 8 critical-path scenarios these designs promote) |
| Status | Living document — updated in place |

## What this is

Each file in this folder is a **design document**, not a runnable spec. The runnable `.spec.ts` gets written later, at DDD/implementation time, by whichever engineer implements the journey it covers. What gets fixed *now* is the execution contract that spec must honor — so "write the Playwright test" at implementation time is never quietly reinterpreted as "write a stub that asserts against a fixture."

## Execution contract (binding on every design in this folder)

Every design below declares, in its own document-control table:

```
execution: live-stack-seeded
stub_mode: forbidden
seed_pack: <name from 02-test-plan.md §3>
```

This means, concretely, for the eventual `.spec.ts`:

- **No `page.route` interception** standing in for a real backend response on any assertion path this design specifies. `page.route` may be used only for things genuinely outside the system under test (e.g., mocking a third-party OAuth provider's consent screen chrome, never the platform's own API).
- **No fixture JSON substituted for a real HTTP call.** Every assertion reads from state the seed pack actually put in Postgres/MinIO and that the real application actually served.
- **No `E2E_LIVE=0`-style env-gated skip-to-stub path.** If the live stack (Postgres + MinIO + fake external-provider adapters, per LLD test-strategy §3's "every port has a fake") isn't up, the spec **skips**, loudly, with a clear reason — it never silently falls back to a mocked run that reports green.
- **Seed data is named, not ad hoc.** Each design cites the exact seed pack from `02-test-plan.md` §3 it depends on; a spec author who needs data the named pack doesn't have extends the pack definition rather than inventing an unnamed fixture inline.

This is this skill's Stage 8 rule verbatim (`sdlc-next` skill, Step 4): Playwright designs at this stage commit to live-stack execution even though the design itself isn't runnable yet, so nobody downstream has to make that decision under implementation pressure.

## Index

| Design | Journey | Seed pack |
|---|---|---|
| `e2e-search-to-contact.spec-design.md` | Seeker: search → profile → contact (golden path) | `seed-core` |
| `e2e-provider-onboarding-publish.spec-design.md` | Provider: registration → live listing | `seed-onboarding` |
| `e2e-availability-lifecycle.spec-design.md` | Availability set → auto-expire | `seed-availability` |
| `e2e-identity-verification.spec-design.md` | Identity verification, approve and reject-resubmit paths | `seed-verification` |
| `e2e-report-resolution.spec-design.md` | Report → human resolution, no automation | `seed-reports` |
| `e2e-billing-lifecycle.spec-design.md` | Trial → paid → failed renewal → grace → auto-unpublish → pay → republish | `seed-billing` |
| `e2e-review-lifecycle.spec-design.md` | Review: ineligible → eligible → reply → report → admin removal | `seed-reviews` |
| `e2e-block-unblock.spec-design.md` | Block/unblock, asymmetric discovery hide | `seed-blocking` |
| `e2e-visual-quality-design-system.spec-design.md` | Design-system conformance & visual regression across breakpoints/personas | `seed-core` |
| `e2e-performance-and-perceived-quality.spec-design.md` | Core Web Vitals + perceived-performance gates on critical-path screens | `seed-core` |

The first eight are the LLD test-strategy's §3 scenarios (E2E-1 through E2E-8 there), promoted here to full live-stack-seeded designs with concrete seed-pack citations. The last two exist because of this delivery's own mission — a top-10 app on visual look, premium feel, and flawless usability needs its own release-gating proof, not just functional-path coverage.
