---
title: Peach Finder — Test Artefacts — Test Strategy
updated: 2026-09-04
---

# Test Strategy — Test Artefacts

## 1. Document Control

| Field | Value |
|---|---|
| Product | Peach Finder |
| Document | QA-facing test strategy (SDLC stage 8) |
| Upstream | `00-overview.md`; `05-low-level-design/14-test-strategy/test-strategy.md` (dev-facing module matrix — not restated here); `PRODUCT.md`, `DESIGN.md` (visual/premium-feel mission) |
| Status | Living document — updated in place |

This document does not repeat the LLD test-strategy's module-by-module unit/integration matrix or its 8 critical-path E2E scenario list — it sits one layer up: it defines *why* those tests exist, what quality bar they're held to, and what this stage adds that the LLD document doesn't cover at all (enumerated test cases traced to stories, a formal traceability matrix, and — driven by this delivery's stated mission — a dedicated visual/perceived-performance testing lane).

## 2. Quality pillars

Every test artefact in this stage is organized against four pillars. The first two are the conventional pillars any product needs; the third and fourth exist specifically because this delivery's mission is to make Peach Finder a top-10 app in its category on visual look, premium feel, and flawless usability — treating them as an afterthought would contradict the mission this stage was commissioned under.

### 2.1 Functional correctness
Does the system do what the FRS/user-stories say it does, including every W-priority guard (no booking calendar, no automated moderation, no personalized ranking)? Covered by `03-test-cases/` and E2E-1..8 in `05-playwright-spec-designs/`.

### 2.2 Trust, safety & data integrity
The platform's two highest-consequence guarantees — human-only moderation (no code path auto-hides/auto-suspends/auto-flags) and money/state idempotency (no double-charge, double-grant, or corrupted transition) — get adversarial, not just happy-path, coverage. These mirror the LLD test-strategy's own "stop-the-line" framing (§2.7, §2.9 there) and are restated here only as a pointer: `03-test-cases/reviews-trust-and-admin.md` and `03-test-cases/billing-analytics-and-privacy.md` carry the story-level cases; the LLD document carries the code-level guard-clause suite.

### 2.3 Visual & interaction quality ("premium feel")
Peach Finder's design system (`DESIGN.md`) is not decorative guidance — it encodes testable rules: the Two-Hue Rule (only Terracotta and Pine ever carry meaning), the Never-Color-Alone Rule (availability/verification always pair color with icon + text), the Warm Shadow Rule (shadows tint toward Terracotta/Ink, never neutral gray), the One-Serif Rule (Fraunces confined to Display/Headline), full-pill (999px) interactive controls, and WCAG AA contrast (4.5:1 text / 3:1 UI) already required by FR-UX-03/SR-COMPAT-04. Every UI-facing story's test cases in `03-test-cases/` carry an explicit visual-conformance check against these named rules — not a subjective "looks good" pass — and the design-system-conformance Playwright design (`05-playwright-spec-designs/e2e-visual-quality-design-system.spec-design.md`) makes a subset of them CI-enforceable via visual regression.

### 2.4 Perceived & measured performance
FR-UX-02/SR-PERF-01..07 already define hard budgets (homepage/search interactive ≤3s, profile ≤2.5s, suggestions ≤200ms, filters ≤1s, ≤300KB JS). "Premium feel" fails the moment these are missed on the reference device (mid-range Android, 4G) — a slow app cannot be a top-10 app regardless of visual polish. This stage promotes those budgets from LLD-documented obligations to release-gating pass/fail assertions via `05-playwright-spec-designs/e2e-performance-and-perceived-quality.spec-design.md`, which also tests *perceived* speed (skeleton states per FR-UX-05, no layout shift on image load) — a technically-fast page that visibly jumps around still reads as cheap.

## 3. Test levels in scope for this stage

| Level | Owner document | This stage's role |
|---|---|---|
| Unit / handler / infra (Testcontainers) | LLD `14-test-strategy.md` §2 (module matrix) | Referenced, not duplicated |
| Story-level functional test cases | `03-test-cases/` (this stage) | Authored here |
| Cross-module critical-path E2E | LLD `14-test-strategy.md` §3 (8 scenarios) + this stage's 2 mission-driven additions | Promoted to full live-stack-seeded Playwright *designs* here (`05-playwright-spec-designs/`) |
| Load/performance (pre-launch) | SR-PERF-07 | Out of scope here — tracked under `08-development-deliverable-documents` per LLD test-strategy §5 |
| Penetration testing | SR-SEC-12 | Out of scope here — external/structured exercise before public launch |
| Restore-drill verification | SR-AVL-05 | Out of scope here — operational runbook exercise |

## 4. Environments & tooling

- **Local/dev:** developer machine, Testcontainers Postgres + MinIO, fake external-provider adapters (per clean-code-guidelines §6 "every port has a fake") for unit/handler tests only.
- **CI:** full composed stack (real Postgres, real MinIO, fake external providers) per LLD test-strategy §3 — this is also the execution target for every Playwright design in `05-playwright-spec-designs/`; none of them may substitute a stub for this stack (see that folder's `00-index.md`).
- **Staging:** production-like environment (SR-OPS-01), sanitized data only, real (sandboxed) PSP/SMS/email providers where the provider offers a test mode — used for pre-release smoke and the visual/performance Playwright designs against real network conditions.
- **Tooling:** Playwright (E2E, visual regression via screenshot diffing, and Core Web Vitals capture through its CDP integration), Testcontainers (Postgres/MinIO infra tests — LLD layer), axe-core or equivalent (WCAG 2.2 AA automated checks, SR-COMPAT-04), Lighthouse or Playwright's own trace-based metrics (SR-PERF-07 synthetic mobile-profile tests).

## 5. Entry & exit criteria

**Entry** (a story's test cases may be executed): the story's UI exists in a real environment (dev/staging), the LLD module(s) it depends on are implemented, and any seed data pack it needs (§`02-test-plan.md` §3) is available.

**Exit** (a story is considered tested and ready for the DDD/implementation-sequence layer to reference): every acceptance-criterion-derived test case in `03-test-cases/` for that story passes; where the story has a visual-conformance row, it passes against the named `DESIGN.md` rule; where the story participates in an E2E scenario, that scenario's Playwright design assertions pass against the live-seeded stack; no CI gate from LLD test-strategy §4 is failing as a side effect.

## 6. Risk-based prioritization

Highest-scrutiny areas, carried forward from the LLD test-strategy's own risk framing and restated at the story level: human-only moderation (no auto-consequence from a report — `03-test-cases/reviews-trust-and-admin.md`), billing idempotency (no double-charge/double-transition — `03-test-cases/billing-analytics-and-privacy.md`), the availability-first ranking guarantee (`03-test-cases/availability-and-discovery.md`), and server-side privacy filtering (phone visibility, exact-location absence — spread across `03-test-cases/identity-and-access.md` and `provider-profile-and-media.md`). These get adversarial test cases, not just a Given/When/Then happy path.

## 7. Defect severity taxonomy

| Severity | Definition | Example |
|---|---|---|
| Blocker | Violates a binding stance (human-only moderation, no booking calendar) or a data-integrity/money guarantee | A report auto-hides a profile; a webhook retry double-charges |
| Critical | An M-priority acceptance criterion fails, or an M-priority SR-PERF/SR-COMPAT budget is missed at p95 | Homepage >3s interactive on reference device; phone number leaks to anonymous markup when OFF |
| Major | An S/C-priority criterion fails, or a named `DESIGN.md` rule is violated (third hue introduced, color-alone status, gray shadow) | A card ships a non-pill button; a status uses color with no icon/text |
| Minor | Cosmetic/copy issue with no functional or trust impact | Label truncation at an unusual viewport width |

A Blocker or Critical finding on the human-only-moderation guard-clause suite or the billing idempotency suite is a stop-the-line event per LLD test-strategy §4.6, not ordinary red-CI triage.

## 8. Non-negotiable stances this stage tests *for*, never *around*

Restated because a test suite is exactly where a binding stance quietly erodes: no pre-publication review or automated content gating (only badge-review exists, and it gates the badge, never the profile); no booking calendar or structured slot data anywhere in messaging; no service-fee payment flow; report reasons are exactly the FR-TRUST-07 taxonomy; featuring never outranks availability-first ordering. Every test case that could plausibly be satisfied by *reintroducing* one of these is written to fail if it does.
