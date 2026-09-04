---
title: E2E Spec Design — Performance & Perceived Quality
updated: 2026-09-04
---

# Performance & perceived-quality gates

**Why this design exists.** A visually polished app that feels slow or janky does not read as premium — it reads as a demo. FR-UX-02 and SR-PERF-01..07 already fix hard performance budgets as release gates; this design is where those budgets stop being LLD-documented obligations and become an actual CI check, and where *perceived* speed — skeleton states, no layout shift, no spinner-on-the-critical-path (FR-UX-05) — gets the same release-gating treatment as measured speed. Both matter to the visual-look/premium-feel/flawless-usability mission this delivery is driven by; a fast page that visibly jumps around while loading still fails that mission.

## Document control

| Field | Value |
|---|---|
| execution | live-stack-seeded |
| stub_mode | forbidden |
| seed_pack | `seed-core` |
| Traces | FR-UX-02, FR-UX-05, FR-UX-08; SR-PERF-01..07; SR-COMPAT-02 |

## Device/network profile

Every measurement in this design runs against the SRS's own reference class — a mid-range Android CPU/memory profile emulated via Playwright's CDP throttling, over a simulated 4G network — never against an unthrottled dev machine. A budget that only passes unthrottled is not proven to pass at all (SR-COMPAT-02).

## Measured-performance assertions (Core Web Vitals as pass/fail gates)

| Surface | Budget | Source |
|---|---|---|
| Homepage / search results interactive | ≤3s | FR-UX-02, SR-PERF-01 |
| Profile page (subsequent navigation) | ≤2.5s | FR-UX-02, SR-PERF-01 |
| Search suggestions render after keystroke | ≤200ms (server ≤100ms) | FR-UX-02, SR-PERF-02 |
| Filter application update | ≤1s, no full reload | FR-UX-02, SR-PERF-03 |
| Message delivery to an online counterpart | ≤2s p95 | SR-PERF-04 |
| Initial core-page JS payload | ≤300KB compressed | SR-PERF-05 |
| Discovery cache freshness | availability never >60s stale | SR-PERF-06 |

Each row is captured via Playwright's performance-timing/CDP trace APIs (or Lighthouse invoked programmatically) against the live-seeded stack — not synthetic numbers computed offline — and asserted as a hard pass/fail, matching SR-PERF-07's "a budget is a release gate" stance.

## Perceived-performance assertions

- **No layout shift on image load.** Capture Cumulative Layout Shift on homepage/search/profile as photos load; assert it stays within a defined near-zero threshold — reserved image dimensions/aspect-ratio boxes should mean no visible jump as photography resolves.
- **Skeleton, not spinner, on the critical path.** On the search→profile→contact path (FR-UX-05), assert the loading treatment is a skeleton/optimistic-UI state, never a bare spinner — inspect the DOM during the loading window, not just the final rendered state.
- **SSR meaningful-content check.** For homepage, search, and profile, assert server-rendered HTML (pre-hydration) already contains meaningful content — not an empty shell waiting on client JS (FR-UX-08, SR-APP-01). Verify by disabling JS execution for this specific check and confirming readable content is still present.
- **First paint on a throttled connection.** Confirm first meaningful paint occurs well before full interactivity, so the page feels like it's already responding even before it's fully ready — the qualitative complement to the CWV numbers above.

## Explicit non-goals

Full load/capacity testing against SR-CAP-01's design point (2,000 providers / 50k monthly seekers / 1,000 peak concurrent) is out of scope here — that's a pre-launch synthetic load-test activity under `08-development-deliverable-documents` per SR-PERF-07 and the LLD test-strategy's own §5 scope note, not a per-build Playwright check.
