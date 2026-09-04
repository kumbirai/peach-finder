---
title: E2E Spec Design — Review Lifecycle
updated: 2026-09-04
---

# E2E-7 — Review: ineligible attempt → thread ages past 24h → eligible submit → provider reply → report → admin removal

## Document control

| Field | Value |
|---|---|
| execution | live-stack-seeded |
| stub_mode | forbidden |
| seed_pack | `seed-reviews` |
| Traces | `user-stories.md` §19.7 process flow; US-REV-01/02/05, US-SAFE-01, US-ADMIN-04; FR-REV-01/02/06, FR-ADM-05 |

## Journey

1. Seeker with a thread <24h old attempts to review → assert eligibility explanation shown, not a hidden control.
2. Advance the seeded thread past the 24h boundary.
3. Same seeker submits a 1–5 rating + text → assert it's live immediately, aggregate updates atomically.
4. Provider posts one public reply → assert it renders beneath the review.
5. A third party reports the review.
6. Admin removes it via the explicit moderation action.
7. Assert removal only happens through this explicit path — no automatic removal occurred between report and admin action.

## Key assertions

- Ineligible-state control explains rather than hides (cross-ref `TC-REV-01b`) — assert the explanation copy is present in the DOM, not merely that the action is disabled.
- Submission-to-live latency is effectively zero — no pending/queued state observable at any point.
- Between the report (step 5) and the admin's decision (step 6), poll the review continuously — assert zero automated change, mirroring `e2e-report-resolution`'s central guarantee applied to reviews specifically.

## Out of scope for this design

Full report-queue admin workflow beyond this single removal (see `e2e-report-resolution`).
