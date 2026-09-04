---
title: E2E Spec Design — Search → Profile → Contact
updated: 2026-09-04
---

# E2E-1 — Search → Profile → Contact (golden path)

## Document control

| Field | Value |
|---|---|
| execution | live-stack-seeded |
| stub_mode | forbidden |
| seed_pack | `seed-core` |
| Traces | `user-stories.md` §19.1 process flow; US-DISC-01/06, US-VIEW-01/03, US-ACC-02, US-MSG-01; FR-SRCH-01/03, FR-PROF-07/08, FR-ACC-02/05 |

## Journey

1. Anonymous session loads the homepage.
2. Assert available-now providers render first, ordered by recency (`seed-core` has mixed-recency available providers).
3. Tap a result card → land on that provider's profile.
4. Assert full FR-PROF-01 field set renders (photos, intro, services+prices, badges, reviews, response time, contact actions).
5. Tap Message.
6. Assert single-screen sign-up interruption (`user-stories.md` §19.1 point K/L) — complete via email+password.
7. Assert return lands in the thread for the exact profile just visited, with no lost context.
8. Send a message; assert it delivers.

## Key assertions (must specifically prove, not merely execute)

- Availability-first ordering is visible in the actual rendered result set, not just asserted at the API layer.
- Anonymous phone visibility respects the seeded provider's own setting (a phone-OFF provider in the set never exposes a number pre-auth; a phone-ON provider does).
- The sign-up interruption is exactly one screen and returns to the exact draft/profile in progress (FR-ACC-05) — assert the returned URL/state matches the pre-interruption state, not just "some thread opened."
- No admin/review-gated state is ever visible anywhere in this path (consistent with the human-only-moderation stance — nothing here should ever show a "pending" badge state on a fully-approved seed provider).

## Out of scope for this design

Full onboarding (covered by `e2e-provider-onboarding-publish`), review submission (covered by `e2e-review-lifecycle`).
